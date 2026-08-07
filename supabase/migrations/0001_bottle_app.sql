-- =============================================================================
-- Bottle App — Supabase / Postgres schema + Row-Level Security
-- =============================================================================
-- Target: Supabase (Postgres 15+). Run via `supabase db push`, the Supabase
-- migration CLI, or paste into the Supabase SQL editor.
--
-- Access model (anonymous-first; client role = `anon`):
--
--   Table         | SELECT                          | INSERT | UPDATE | DELETE
--   --------------+---------------------------------+--------+--------+-------
--   messages      | safe columns only*              |  yes   |   no   |   no
--   reactions     | all columns                     |  yes   |   no   |   no
--   quick_replies | all columns                     |  yes   |   no   |   no
--   reports       | NONE (write-only)               |  yes   |   no   |   no
--
--   * "safe columns" = id, content, category, language, reveal_count,
--     reported_count, is_hidden, is_seed, created_at.
--     author_session_hash and private_token are NEVER SELECT-granted.
--
-- How the two sensitive columns are handled:
--   - author_session_hash: written by the client at INSERT time (the client
--     knows its own session hash), stored server-side, used by service-role
--     moderation/rate-limiting. Never readable by the client (column not
--     granted), so it cannot be enumerated.
--   - private_token: generated server-side by a BEFORE INSERT trigger
--     (256-bit hex). The author receives it EXACTLY ONCE from the
--     create_bottle() security-definer function and reuses it locally.
--     revisit_my_bottle(token) proves ownership server-side and returns only
--     the safe columns. The column itself is never SELECT-granted.
--
-- Why private_token is stricter than "never SELECT others' token":
--   Postgres column privileges are table-level, not row-conditional. If
--   private_token were SELECT-granted, any feed query would expose every
--   visible row's token (including other people's bottles). We therefore do
--   NOT grant SELECT on it at all and gate ownership through a definer
--   function. This is strictly more secure and still satisfies the intent.
--
-- The `service_role` / `postgres` superuser bypasses RLS and is used for all
-- moderation, admin, and counter-mutation work.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Extensions
-- -----------------------------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid(), gen_random_bytes()

-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------
do $$ begin
  create type message_category as enum ('advice', 'venting', 'fun_question', 'encouragement');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reaction_type as enum ('heart', 'smile', 'feel_you');
exception when duplicate_object then null; end $$;

do $$ begin
  create type report_reason as enum ('self_harm', 'harassment', 'spam', 'personal_info', 'other');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- 2. Tables
-- -----------------------------------------------------------------------------
create table if not exists public.messages (
  id                  uuid primary key default gen_random_uuid(),
  content             text not null,
  category            message_category,
  language            text,                                   -- auto-detected at insert
  author_session_hash text not null,                          -- hashed anon session; never exposed
  reveal_count        integer not null default 0,
  reported_count      integer not null default 0,
  is_hidden           boolean not null default false,
  is_seed             boolean not null default false,
  private_token       text unique,                            -- lets author revisit their bottle
  created_at          timestamptz not null default now()
);

create table if not exists public.reactions (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.messages(id) on delete cascade,
  type        reaction_type not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.quick_replies (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.messages(id) on delete cascade,
  content     text not null check (char_length(content) <= 30),
  created_at  timestamptz not null default now()
);

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.messages(id) on delete cascade,
  reason      report_reason not null,
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3. Indexes
-- -----------------------------------------------------------------------------
-- Feed index: only non-hidden rows, newest first.
create index if not exists messages_feed_idx
  on public.messages (created_at desc)
  where is_hidden = false;

create index if not exists messages_category_idx     on public.messages (category);
create index if not exists messages_session_hash_idx on public.messages (author_session_hash);
create index if not exists messages_private_token_idx on public.messages (private_token);
create index if not exists reactions_message_idx     on public.reactions (message_id);
create index if not exists quick_replies_message_idx on public.quick_replies (message_id);
create index if not exists reports_message_idx       on public.reports (message_id);

-- -----------------------------------------------------------------------------
-- 4. Server-side private_token generation (256-bit hex) on INSERT
--    The client never supplies private_token; it is always generated here and
--    handed back exactly once via create_bottle().
-- -----------------------------------------------------------------------------
create or replace function public.fn_set_private_token()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.private_token is null then
    new.private_token := encode(gen_random_bytes(32), 'hex');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_private_token on public.messages;
create trigger trg_set_private_token
  before insert on public.messages
  for each row execute function public.fn_set_private_token();

-- -----------------------------------------------------------------------------
-- 5. On report inserted: bump reported_count and auto-hide past a threshold.
--    Threshold (3) is intentionally low for safety; pair with edge rate-
--    limiting so a single anon cannot grief-hide a message. Tune as needed.
-- -----------------------------------------------------------------------------
create or replace function public.fn_on_report_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.messages
     set reported_count = reported_count + 1,
         is_hidden      = case when reported_count + 1 >= 3 then true else is_hidden end
   where id = new.message_id;
  return new;
end;
$$;

drop trigger if exists trg_on_report_inserted on public.reports;
create trigger trg_on_report_inserted
  after insert on public.reports
  for each row execute function public.fn_on_report_inserted();

-- -----------------------------------------------------------------------------
-- 6. Row-Level Security
-- -----------------------------------------------------------------------------
alter table public.messages      enable row level security;
alter table public.reactions     enable row level security;
alter table public.quick_replies enable row level security;
alter table public.reports       enable row level security;

-- messages: SELECT — the public feed (non-hidden). Own-bottle revisit is done
--           through revisit_my_bottle(), not a direct table SELECT, so no
--           session-hash branch is needed here (and author_session_hash is
--           never SELECT-granted, so it cannot leak).
drop policy if exists "messages_select_feed"   on public.messages;
drop policy if exists "messages_insert_anon" on public.messages;
create policy "messages_select_feed"
  on public.messages for select
  to anon
  using (is_hidden = false);

-- messages: INSERT — any anon may create a bottle. Which columns the client
--           may actually write is controlled by the column-level grant in §7.
create policy "messages_insert_anon"
  on public.messages for insert
  to anon
  with check (true);

-- reactions: SELECT (display) + INSERT. No UPDATE/DELETE.
drop policy if exists "reactions_select_all"   on public.reactions;
drop policy if exists "reactions_insert_anon" on public.reactions;
create policy "reactions_select_all"
  on public.reactions for select to anon using (true);
create policy "reactions_insert_anon"
  on public.reactions for insert to anon with check (true);

-- quick_replies: SELECT (display) + INSERT. No UPDATE/DELETE.
drop policy if exists "quick_replies_select_all"   on public.quick_replies;
drop policy if exists "quick_replies_insert_anon" on public.quick_replies;
create policy "quick_replies_select_all"
  on public.quick_replies for select to anon using (true);
create policy "quick_replies_insert_anon"
  on public.quick_replies for insert to anon with check (true);

-- reports: INSERT only. No SELECT — reports cannot be enumerated by clients.
drop policy if exists "reports_insert_anon" on public.reports;
create policy "reports_insert_anon"
  on public.reports for insert to anon with check (true);

-- -----------------------------------------------------------------------------
-- 7. Grants (column-level where it matters)
-- -----------------------------------------------------------------------------

-- messages: revoke everything, then grant precisely.
revoke all on public.messages from anon;
-- INSERT: only the columns a client may set. id / private_token / created_at
-- / counters / flags use server defaults (private_token via the trigger).
grant insert (content, category, language, author_session_hash)
  on public.messages to anon;
-- SELECT: ONLY safe columns. Never author_session_hash, never private_token.
grant select
  (id, content, category, language, reveal_count, reported_count,
   is_hidden, is_seed, created_at)
  on public.messages to anon;

-- reactions: SELECT + INSERT only.
revoke all on public.reactions from anon;
grant select on public.reactions to anon;
grant insert on public.reactions to anon;

-- quick_replies: SELECT + INSERT only.
revoke all on public.quick_replies from anon;
grant select on public.quick_replies to anon;
grant insert on public.quick_replies to anon;

-- reports: INSERT only (no SELECT).
revoke all on public.reports from anon;
grant insert (message_id, reason) on public.reports to anon;

-- Enum types: the client needs USAGE to reference enum values in INSERTs.
grant usage on type message_category to anon;
grant usage on type reaction_type    to anon;
grant usage on type report_reason    to anon;

-- -----------------------------------------------------------------------------
-- 8. Security-definer functions (the privileged gateways)
--    Owned by the migration runner (postgres) -> bypass RLS. These are the
--    ONLY paths that touch private_token, and they never return
--    author_session_hash.
-- -----------------------------------------------------------------------------

-- create_bottle(): secure creation path. Generates private_token server-side
-- and returns it ONCE. (Direct INSERT into messages is also allowed by policy
-- for the columns granted in §7, but cannot RETURN private_token because that
-- column is not SELECT-granted — so use this function to obtain the token.)
create or replace function public.create_bottle(
  p_content      text,
  p_category     message_category default null,
  p_language     text default null,
  p_session_hash text default null
)
returns table (id uuid, private_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_token text;
begin
  if p_content is null or char_length(p_content) = 0 then
    raise exception 'content is required';
  end if;
  insert into public.messages
    (content, category, language, author_session_hash)
  values
    (p_content, p_category, p_language, p_session_hash)
  returning id, private_token into v_id, v_token;
  return query select v_id, v_token;
end;
$$;

grant execute on function public.create_bottle(text, message_category, text, text) to anon;

-- revisit_my_bottle(): returns the SAFE columns of the caller's own bottle
-- when the private_token matches. Never returns author_session_hash or
-- private_token. Returns no rows for a non-matching token (no enumeration).
create or replace function public.revisit_my_bottle(p_private_token text)
returns table (
  id uuid, content text, category message_category, language text,
  reveal_count integer, reported_count integer, is_hidden boolean,
  is_seed boolean, created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select m.id, m.content, m.category, m.language, m.reveal_count,
           m.reported_count, m.is_hidden, m.is_seed, m.created_at
      from public.messages m
     where m.private_token = p_private_token
     limit 1;
end;
$$;

grant execute on function public.revisit_my_bottle(text) to anon;

-- reveal_bottle(): increments reveal_count. Clients have no UPDATE privilege,
-- so counter mutations must go through this definer function.
create or replace function public.reveal_bottle(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.messages set reveal_count = reveal_count + 1 where id = p_id;
end;
$$;

grant execute on function public.reveal_bottle(uuid) to anon;
