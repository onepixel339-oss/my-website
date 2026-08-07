---
Task ID: 2
Agent: general-purpose (crisis-resource-researcher)
Task: Research local (Egypt/Cairo) and international crisis resources for self-harm supportive response

Work Log:
- Read /home/z/my-project/worklog.md (did not exist yet — created fresh via append).
- Invoked the web-search Skill (command="web-search") and used the z-ai CLI to run 10 targeted web searches across Egypt-specific and international crisis-line queries.
- Verified the Egypt General Secretariat of Mental Health and Addiction Treatment (GSMHAT) hotline **16328** against 6+ independent sources: progress.guide, opencounseling.com, Wikipedia's List of suicide crisis lines, UNHCR Egypt, Egypt State Information Service (sis.gov.eg), Egypt Independent, WHO EMRO, PMC/NIH (Okasha 2022), and the Ministry of Health's own site (mentalhealth.mohp.gov.eg). 24/7, free, confidential.
- Cross-referenced secondary GSMHAT numbers 08008880700 and 0220816831 (egypttoday.com 2020, gethlp.me, UNHCR Egypt). Listed as alternates.
- Researched Befrienders Cairo (a Befrienders Worldwide member centre, est. 1992). Numbers 7621602/3 and 7622381 appear in 6 third-party directories (suicide.org, opencounseling.com, letsconnectcanada.ca, wellnesscoach.live PDF, CCA portal, ibpf.org). Could not load the primary befrienderscairo.com site directly to confirm current operation — flagged as "verify locally".
- Verified international fallbacks: IASP crisis-centres directory (iasp.info/crisis-centres-helplines), Befrienders Worldwide (befrienders.org), Find A Helpline (findahelpline.com), 988 Suicide & Crisis Lifeline (988lifeline.org — call/text 988, US), Samaritans UK (116 123, free, 24/7 — samaritans.org, NHS.uk, mind.org.uk), Crisis Text Line (Text HOME to 741741, US/Canada/UK/Ireland — crisistextline.org).
- Compiled findings into a single paste-ready TypeScript-constants markdown block with an Egypt-primary / international-fallback split and a warm, non-preachy 3-sentence acknowledgment message.
- Appended this record to /home/z/my-project/worklog.md.

Stage Summary:
- Egypt primary resource confirmed: GSMHAT hotline 16328 (24/7, +20). High confidence (6+ sources incl. official .gov.eg and WHO).
- Egypt secondary: GSMHAT alternates 08008880700 / 0220816831. Medium-high confidence.
- Egypt tertiary: Befrienders Cairo +20 2 7621602 / 7622381 — flagged "verify locally" (numbers are older directory entries; website not directly reachable in this session).
- International fallbacks verified: IASP directory, Befrienders Worldwide, Find A Helpline, 988 (US), Samaritans UK 116 123, Crisis Text Line 741741 (US/CA/UK/IE).
- Supportive acknowledgment message drafted (3 sentences, English, non-judgmental, no repetition of flagged content).
- Deliverable returned to caller as a single markdown block ready to paste into a TS constants file.

---
Task ID: 1,3,4,5,6,7
Agent: main orchestrator (Z.ai Code)
Task: Implement a synchronous content-moderation pipeline that runs before the INSERT in the exchange endpoint, plus the exchange endpoint itself, admin review dashboard, and frontend.

Work Log:
- Read project scaffold (Next.js 16, Prisma/SQLite, shadcn/ui, z-ai-web-dev-sdk). No prior "reciprocal-unlock" worklog existed, so built a coherent self-contained "exchange" message-board context for the moderation pipeline to plug into.
- Invoked the LLM Skill to learn the z-ai-web-dev-sdk chat.completions API for the moderation classifier.
- Delegated Task ID 2 (crisis-resource research) to a subagent, which returned verified Egypt (GSMHAT 16328) + international resources.
- Task 1 — Prisma schema: added ExchangeMessage (is_hidden, moderation_status, moderation_flag_type, moderation_confidence, published_at, admin_resolved_at) and ModerationLog (flag_type, confidence, decision, model_version — deliberately NO trigger-word field). Ran `bun run db:push`.
- Task 3 — src/lib/moderation.ts: synchronous `moderateMessage()` using z-ai LLM as a strict JSON classifier (6 categories: self_harm, harassment, sexual_minors, hate_speech, graphic_violence, doxxing). System prompt forbids echoing trigger words. Code (not model) applies policy thresholds: self_harm>=0.45 -> self_harm_block; severe>=0.7 -> reject; borderline>=0.4 -> pending_review; else publish. Fail-safe: classifier error -> pending_review (never auto-publish). Includes Egypt+international crisis resources + supportive acknowledgment + generic non-revealing rejection/review notices.
- Task 4 — src/app/api/exchange/route.ts: POST runs `moderateMessage()` BEFORE the INSERT, then persists message + ModerationLog in one transaction. Returns per-decision payload: published (distributed), self_harm_blocked (supportive crisis-resources card, NOT distributed), rejected (generic notice), pending_review (held-notice). GET returns ONLY published/non-hidden messages, with all moderation fields stripped.
- Task 5 — src/app/api/admin/review/route.ts (GET: list flagged + summary counts, includes flag type/confidence/logs but no trigger words) and src/app/api/admin/review/[id]/route.ts (POST: approve / reject / resolve, each writes a human_* ModerationLog row).
- Task 6 — Frontend on `/` only: tabs (Exchange + Admin review), sticky footer (min-h-screen flex-col + mt-auto). Components: self-harm-support.tsx (warm card, clickable tel:/links, Egypt + international sections), exchange-board.tsx (composer + outcome banners + feed), admin-review.tsx (summary cards, filters, flagged items with approve/reject/resolve + audit log). Fixed a publishedAt/createdAt shape bug found during browser testing (POST response now returns publishedAt consistently).
- Task 7 — Verification: `bun run lint` clean. Probed all 5 moderation paths via curl (publish, self_harm_block, reject x2, pending_review) — all correct. Verified public feed excludes flagged content. Agent Browser end-to-end: posted clean msg (published+in feed), posted self-harm msg (supportive card with crisis resources, NOT distributed, NOT echoed), switched to Admin tab (summary counts + flagged items with flag type/confidence + safety callout), approved a borderline item (awaiting 1->0, published 3->4, approved msg appeared in feed). Console + page errors clean. Sticky footer verified via bounding boxes: short content -> footer.bottom===viewport (sticky:true); long content -> footer pushed to document bottom (no overlap). Mobile (iPhone 14) responsive verified.

Stage Summary:
- Moderation runs synchronously before INSERT and blocks distribution (never after-the-fact).
- Self-harm -> supportive response with Egypt-local (GSMHAT 16328) + international crisis resources; message never distributed; author always acknowledged (never silently rejected).
- Severe categories (hate/harassment/sexual_minors/doxxing/violence) -> is_hidden=true, rejected, not distributed.
- Borderline -> pending_review -> human admin dashboard (approve/reject/resolve). Verified full loop.
- Audit log stores flag type + confidence + decision ONLY; never stores or exposes trigger words to anyone (end users or admins).
- All deliverables lint-clean and browser-verified end-to-end. Dev server running on :3000.

---
Task ID: 8
Agent: main orchestrator (Z.ai Code)
Task: Design a Postgres (Supabase) schema for the bottle app (messages, reactions, quick_replies, reports) with RLS policies restricting client to INSERT-only and never exposing author_session_hash / others' private_token.

Work Log:
- Read worklog (previous: moderation pipeline on Prisma/SQLite). This task targets a DIFFERENT persistence layer (Supabase/Postgres) — a SQL design deliverable, not a code change to the running Next.js app.
- Checked sandbox tooling: no psql/postgres/initdb/docker/supabase available (Next.js-only sandbox). Cannot execute the migration locally to validate RLS; relied on careful Postgres-correctness self-review instead.
- Authored supabase/migrations/0001_bottle_app.sql:
  - Enums: message_category, reaction_type, report_reason (idempotent via do-exception blocks).
  - Tables: messages, reactions, quick_replies, reports per spec (columns, FKs on delete cascade, quick_replies content <=30 check).
  - Indexes: partial feed index on messages(created_at desc) where is_hidden=false, plus category/session_hash/private_token + child message_id indexes.
  - Trigger fn_set_private_token (BEFORE INSERT): server-side 256-bit hex private_token via gen_random_bytes(32). Client never supplies the token.
  - Trigger fn_on_report_inserted (AFTER INSERT on reports): increments reported_count + auto-hides at >=3 reports (threshold tunable; pair with edge rate-limiting to prevent grief-hide).
  - RLS enabled on all 4 tables. Policies: messages SELECT = feed (is_hidden=false); INSERT = anon with check true. reactions/quick_replies SELECT+INSERT. reports INSERT only (no SELECT -> cannot be enumerated).
  - Column-level grants: messages revoke-all then grant SELECT on safe columns ONLY (never author_session_hash, never private_token); grant INSERT (content, category, language, author_session_hash) only. reactions/quick_replies: SELECT+INSERT. reports: INSERT(message_id, reason) only. Enum USAGE grants to anon (needed to pass enum literals).
  - Security-definer functions (owned by postgres -> bypass RLS): create_bottle() returns id+private_token ONCE (the secure token-delivery path, since INSERT...RETURNING private_token is blocked by the column grant); revisit_my_bottle(token) returns safe columns only when token matches (no enumeration); reveal_bottle(id) increments reveal_count (clients have no UPDATE).
- Self-reviewed against Postgres gotchas: (1) RETURNING requires SELECT priv on returned cols -> private_token unreturnable via direct INSERT, hence create_bottle. (2) RLS policies can reference non-granted columns -> author_session_hash usable in policy without being exposed. (3) FK enforcement ignores RLS -> reactions can reference hidden message ids (minor uuid leak; noted as optional hardening). (4) Enum USAGE required for anon. (5) Security-definer functions bypass RLS as intended. All resolved correctly.
- Made policies idempotent (drop policy if exists before each create) so the file is safe to re-run in the Supabase SQL editor.
- Structural sanity check via Node: 7 create-policy / 7 drop-policy (balanced), 5 functions all security definer, all enum usage grants present, dollar-quotes balanced -> ERRORS: none.
- Note: did NOT modify the running Next.js app (still Prisma/SQLite). Offered (in chat) to mirror this schema into Prisma or wire the existing moderation pipeline onto it as a follow-up.

Stage Summary:
- Deliverable: supabase/migrations/0001_bottle_app.sql (single idempotent migration, ready for `supabase db push` or SQL editor).
- Access model enforced: client (anon) can only INSERT into messages/reactions/quick_replies/reports; no UPDATE/DELETE anywhere; reports not SELECTable.
- author_session_hash: never SELECT-granted (cannot be enumerated by clients); used only server-side.
- private_token: never SELECT-granted; delivered once via create_bottle() SECURITY DEFINER; revisit via revisit_my_bottle(token) which returns safe columns only. Stricter than the literal requirement (documented why: Postgres column privileges are table-level, not row-conditional).
- Could not execute against a real Postgres (no DB tooling in sandbox); correctness validated by structural check + Postgres gotcha self-review. Ready to run against a Supabase project.

---
Task ID: 11,12,13,14,15,16
Agent: main orchestrator (Z.ai Code)
Task: Implement a PII filter that runs on every submitted message AND quick reply before storage: detect/redact-block phone/email/URLs/social handles/long numeric IDs; reject (don't silently strip) with the exact notice + highlighted detected portion; apply the same filter to quick_replies.

Work Log:
- Read worklog (prior: moderation pipeline + Supabase schema). Noted the running app had NO quick_replies yet (only existed in the unconnected Supabase schema) — so added quick_replies to the running app too.
- Built src/lib/pii-filter.ts: synchronous, pure, regex-based. Categories: phone (+/separators/>=7 digits, post-filtered so pure-digit runs go to long_numeric_id), email, url (http(s)://, www., bare domains with known TLDs + negative-lookahead to avoid "jpg"->"jp" partials), social_handle (@username with negative lookbehind on \w to exclude email-local @), long_numeric_id (8+ consecutive digits). Overlap dedup by span, priority-ordered (email>url>handle>phone>longid). Returns findings with start/end offsets for highlighting.
- Validated 21 regex test cases via standalone Node script (all PII categories detected; false positives on filenames/dates/decimals/e.g./years/short numbers all correctly ignored). Fixed one FP ("photo.jpg" matched "photo.jp") with a (?![a-zA-Z0-9]) boundary after the TLD.
- Wired into /api/exchange POST: PII gate runs BEFORE moderation and BEFORE INSERT. On detection -> {status:"pii_rejected", notice, findings} (200, consistent with other outcomes); message NEVER stored, NEVER moderated (so PII never reaches the audit log). Verified the ordering with a combined PII+self-harm message -> correctly short-circuited to pii_rejected (phone), never hit the classifier.
- Added QuickReply Prisma model (id/messageId FK cascade/authorHandle/content/createdAt, indexes) + relation on ExchangeMessage. db:push + db:generate (explicit regenerate needed; dev server restarted to pick up new client delegate — fixed the db.quickReply undefined 500).
- Built /api/quick-replies (POST + GET): same PII filter before INSERT; content <=30 chars; parent must be published (no replying to moderated-away rows). GET lists replies for a published parent.
- Frontend: PiiRejectedBanner (reused on both surfaces) renders the exact spec notice + category badges + the submitted text with detected portions wrapped in <mark>. ExchangeBoard: added pii_rejected outcome (keeps content in textarea so author can edit+resubmit). QuickReplies component: lazy-loaded per message card (expand toggle), compact PII banner inline, 30-char counter, optimistic add.
- Updated page info banner to describe both gates (PII + moderation).
- Verification: curl-tested all 5 PII categories on BOTH /api/exchange and /api/quick-replies -> all pii_rejected with correct category + exact notice. Clean message + clean quick reply -> published. TOOLONG quick reply (>30) -> 400. Combined PII+selfharm -> pii_rejected (short-circuit before moderation confirmed). Agent Browser: PII message on main composer -> banner with <mark>-highlighted email + phone + category badges + exact notice; quick-replies expand -> clean reply posted (count badge 1) -> PII quick reply -> inline compact banner with highlighted phone, reply NOT stored, count stayed 1. Console + page errors clean. bun run lint clean.

Stage Summary:
- Deliverables: src/lib/pii-filter.ts (reusable filter), PII gate wired into /api/exchange + /api/quick-replies (both before INSERT), QuickReply Prisma model, /api/quick-replies endpoint, PiiRejectedBanner + QuickReplies components, page info updated.
- Behavior matches spec exactly: detect phone/email/url/social_handle/long_numeric_id; reject (never silently strip) with the exact notice "Your message seems to include contact info or a link — bottles here stay anonymous, please remove it and try again"; highlight the detected portion (via <mark> on the author's own text); same filter on quick_replies.
- Ordering: PII gate runs BEFORE moderation (cheap short-circuit; PII never stored/audited). Both gates run BEFORE INSERT and block distribution.
- Quick replies did not previously exist in the running app (only in the Supabase schema); added them here with the same PII filter so the second leak surface is covered.
- All lint-clean and browser-verified end-to-end. Dev server running on :3000.

---
Task ID: 17,18,19,20,21,22,23
Agent: main orchestrator (Z.ai Code)
Task: Implement the bottle-app message composer — textarea with live char counter (max 500, soft warning color near limit), optional category selector (Advice/Venting/Fun question/Encouragement), submit with loading state ("Sealing your bottle…") + throw animation, client-side validation (empty/whitespace + min 10 chars), and a POST /api/messages route storing {id, content, category, language (auto-detected), created_at, reveal_count=0, reported_count=0, is_hidden}.

Work Log:
- Read worklog (prior: moderation pipeline + Supabase schema + PII filter all live). Reused the existing PII filter, moderation lib, SelfHarmSupportCard, and PiiRejectedBanner so the new composer inherits the same safety gates.
- Prisma schema: extended ExchangeMessage with bottle fields — `category String?`, `language String @default("en")`, `revealCount Int @default(0)`, `reportedCount Int @default(0)`, `source String @default("exchange")` (discriminator so the bottle feed and the legacy exchange feed never cross-pollinate; @default backfills existing rows to "exchange"). Added @@index([source]) + @@index([category]). Ran db:push + db:generate. Had to restart the dev server — the running process held a stale Prisma client that didn't know the new `source` column (500 "Unknown argument source"); explicit db:generate + dev restart cleared it.
- src/lib/language-detect.ts: dependency-free Unicode-script heuristic. Tallys chars per script block (Arabic/CJK/Hiragana+Katakana/Hangul/Cyrillic/Devanagari/Greek/Hebrew/Thai/Latin); returns the dominant non-Latin script's 2-letter code when it's >=15% of letters, else "en". Special-cases Japanese (kana+CJK -> "ja"). Never throws. Includes languageLabel() for feed badges (e.g. "العربية", "中文", "English").
- src/lib/bottle-categories.ts: shared category registry (key/label/hint/icon/badgeClassName) + parseBottleCategory() validator + getBottleCategory() lookup. Stored value is the stable key (advice|venting|fun_question|encouragement), never the label.
- src/app/api/messages/route.ts: POST pipeline = validate (10–500 chars, optional category) → PII gate (reuse filterMessage, short-circuits before moderation/INSERT) → moderation gate (reuse moderateMessage) → detectLanguage → INSERT with source="bottle" + anonymous server-generated authorId/handle (schema requires non-null; bottle is anonymous so the public response never includes them) + ModerationLog. Returns the exact spec field shape on publish: {id, content, category, language, created_at, reveal_count, reported_count, is_hidden}. GET returns ONLY published non-hidden bottles (source="bottle"), anonymous (no authorId/authorHandle/moderation metadata).
- Patched src/app/api/exchange/route.ts: POST sets source="exchange", GET filters source="exchange" — keeps the legacy exchange feed separate from the bottle feed.
- src/components/bottle/bottle-throw-animation.tsx: framer-motion overlay. Amber-glass bottle SVG (cork/neck/body/highlight/rolled note) launches from bottom-center, arcs up-right while spinning + shrinking + fading (4 keyframes, 1.7s easeInOut), with a launch ripple + 2 trailing sparkle droplets. useReducedMotion -> skips the arc (resolves immediately). Safety setTimeout(2.2s) ensures onComplete fires even if unmounted mid-flight.
- src/components/bottle/bottle-composer.tsx: the composer. Phase machine idle→submitting→throwing→drifting→idle. Category chips (4 toggle buttons, role=radiogroup, click-to-deselect for "no category"). Textarea maxLength=500 with live counter ("X / 500") that shifts muted→amber-600 at >=450 (90%)→red-600 at 500. Live hint: "N more characters to go…" when 0<trimmed<10, "Looks good…" when valid, min-length guidance when empty. Submit button disabled when trimmed<10 or busy; shows "Sealing your bottle…" + spinner during submitting. On publish → throw animation → "Your bottle is drifting out to sea" confirmation (2.6s) → reset. Non-publish outcomes reuse PiiRejectedBanner (keeps content for editing), SelfHarmSupportCard (clears content), and hold/reject Alerts. onPublished callback bumps the page's refreshSignal so the feed refetches.
- src/components/bottle/bottle-feed.tsx: anonymous feed (GET /api/messages). Each bottle card: tiny bottle glyph (no author avatar — anonymous), category badge + detected-language badge (Globe icon + label) + time-ago, content, reveal_count shown only when >0. Scrollable (max-h-[34rem] overflow-y-auto, thin scrollbar). Skeleton + empty states. Refetches on refreshSignal change + own refresh button.
- src/app/page.tsx: redesigned as the bottle app. Amber Waves header "Message in a Bottle". Info banner (kept, describes both gates). Tabs: "The Sea" (BottleComposer + BottleFeed) and "Admin review" (existing dashboard — now also reviews flagged bottles since they're ExchangeMessage rows). Sticky footer (min-h-screen flex-col + mt-auto) preserved.
- Verification: curl — GET empty; POST valid English -> published with exact spec fields + language="en"; POST Arabic -> published + language="ar" (detection works); POST <10 chars -> 400 invalid; POST with phone -> pii_rejected (short-circuit, never stored). Agent Browser — page renders (composer + 4 category chips + disabled submit + feed with 2 test bottles); short message "hi there" -> button stays disabled + hint "2 more characters to go…" + counter "8 / 500" muted; select Encouragement -> aria-checked=true; valid message -> button enabled + hint "Looks good…"; counter at 460 -> amber-600, at 500 -> red-600 (warning color verified); click submit -> button shows "Sealing your bottle…" -> throw animation plays -> feed count 2→3 -> composer reset -> drifting confirmation; feed bottles show category + language badges (incl. "العربية" for the Arabic bottle); mobile (iPhone 14) -> category chips wrap to 2 cols (responsive); sticky footer at document bottom (footerAtBottom=true, no overlap) on long content. Console + page errors clean. bun run lint clean.

Stage Summary:
- Deliverables: Prisma schema (category/language/revealCount/reportedCount/source on ExchangeMessage), src/lib/language-detect.ts, src/lib/bottle-categories.ts, src/app/api/messages/route.ts (POST+GET), src/components/bottle/{bottle-composer,bottle-feed,bottle-throw-animation}.tsx, redesigned src/app/page.tsx.
- Composer matches spec: live 500-char counter with soft amber warning at >=450 + red at 500; optional category selector (4 tones, stored as stable keys); submit disables + shows "Sealing your bottle…" then triggers a framer-motion throw animation (bottle arcs across screen + fades) followed by a "drifting out to sea" confirmation; client validation (empty + <10 chars blocked via disabled button + live hint); POST /api/messages stores exactly {id, content, category, language (auto-detected), created_at, reveal_count=0, reported_count=0, is_hidden} — and returns that shape on publish.
- Safety inherited: the new endpoint reuses the existing PII filter (runs first, short-circuits before moderation/INSERT) and moderation classifier (self-harm -> support; severe -> reject; borderline -> review). Bottles share the ExchangeMessage table so the existing admin review queue also covers flagged bottles.
- Anonymity: bottles store no user-identifying author info; the public feed response omits authorId/authorHandle entirely. Server generates an opaque anon authorId + poetic handle only to satisfy the shared schema's non-null columns (internal, never returned to readers).
- Language auto-detection is dependency-free (Unicode-script heuristic) and verified on Arabic ("ar") + English ("en").
- All lint-clean and browser-verified end-to-end. Dev server running on :3000.

---
Task ID: 24,25,26,27,28,29,30
Agent: main orchestrator (Z.ai Code)
Task: Implement the reciprocal-unlock system — a user can only receive a random message AFTER their own submission is stored. New POST /api/messages/exchange endpoint does the entire exchange (moderation → insert → select random other → increment reveal_count) in a single server-side transaction. Never trust the client to "unlock" reading. Cold-start: if fewer than 20 real messages exist, serve from curated seed bottles (is_seed=true).

Work Log:
- Read worklog (prior: bottle composer + PII filter + moderation + language detect all live). Reused moderation lib, PII filter, language-detect, and bottle-categories so the exchange inherits the same safety gates.
- Prisma schema: added `isSeed Boolean @default(false)` + `@@index([isSeed])` to ExchangeMessage. db:push + db:generate. Seeds are published, non-hidden, source="bottle", indistinguishable from real bottles in the public feed.
- scripts/seed-bottles.ts: idempotent seed (checks count of is_seed=true; skips if any exist). 25 curated starter bottles across the 4 categories (advice/venting/fun_question/encouragement) in English + Arabic (Egypt context). Spread publishedAt over ~10 days for organic feed ordering. Uses a standalone PrismaClient (not the Next.js singleton) so it runs cleanly via `bun run scripts/seed-bottles.ts`. Ran it → 25 seeds inserted.
- src/lib/anonymous-session.ts: cookie-based anonymous session. HTTP-only `bottle_session` cookie = 256-bit random hex token (generated server-side on first visit, 1-year max-age, SameSite=Lax). DB stores ONLY sha256(token) as authorId — the raw token never touches the DB, so a DB leak can't be correlated to a cookie and the cookie can't be reversed to enumerate rows. Chose cookie over IP hash: IPs are shared (NAT/carriers) and rotate (mobile), which would both over-exclude and under-exclude.
- src/app/api/messages/exchange/route.ts: the reciprocal-unlock endpoint. NO GET handler (405) — the only way to "receive" is to POST a valid, moderation-passing message; there is no separate read endpoint to bypass writing.
  Pipeline:
    1. getSessionFromRequest(req) — get-or-create the anonymous session cookie.
    2. Validate content (10–500 chars) + optional category.
    3. PII gate — filterMessage() short-circuits before moderation/INSERT (never stored, never moderated). Returns pii_rejected with notice + findings.
    4. Moderation — moderateMessage() synchronous. ONLY "publish" proceeds to the exchange. self_harm_block/reject/pending_review store the message (hidden) + ModerationLog but return the moderation outcome WITHOUT a received bottle (reward aligned with a distributable contribution).
    5. Single $transaction (the core reciprocal-unlock):
       a. INSERT own message (authorId=sha256(cookie), source="bottle", published).
       b. INSERT ModerationLog audit row.
       c. Cold-start check: count real (non-seed) eligible published non-hidden non-own messages. If < 20, include seeds in the pool (includeSeeds=true).
       d. selectReceivedBottle(tx, ownHash, preferred{language,category}, includeSeeds): filter-relaxation ladder [lang+cat → lang → cat → none]; for each level, aggregate _min(revealCount) to find the lowest tier, findMany where revealCount=min, pick one at random, UPDATE increment reveal_count. Returns the post-increment bottle. This implements "order by reveal_count ASC, then random within the lowest tier" — spreads exposure evenly without a hard cap that could exclude everything.
    6. finalize() sets the session cookie on the response if newly generated (every code path, including errors, goes through finalize so first-time visitors always get their cookie).
  Response on publish: {status:"published", message:<own>, received:<other|null>}. received is anonymous (no authorId/handle/moderation metadata), reveal_count already incremented.
- src/components/bottle/types.ts: extracted PublicBottle interface to a shared module to avoid circular imports between composer ↔ received-bottle.
- src/components/bottle/received-bottle.tsx: distinct teal/ocean "from the sea" card. Shows "A bottle drifted back to you" header, category + language badges, "Found Nx" badge when reveal_count>1, content, and a Dismiss. Persists after the drifting confirmation auto-clears.
- bottle-composer.tsx: switched from POST /api/messages to POST /api/messages/exchange. On publish, stashes data.received in a useRef; throw animation plays; handleThrowComplete reveals the received bottle + drifting confirmation (auto-clears after 2.6s); received bottle persists with Dismiss until cleared or next cast. Re-exported PublicBottle from types.ts for backward compat.
- page.tsx: updated info banner to explain the reciprocal-unlock mechanic ("Cast a bottle to receive one. Every throw is a trade… You can't receive without giving first. When the pool is small, curated starter bottles keep the sea from being empty.").
- Verification:
  curl: first cast (fresh cookie) → published + received a category-matched seed (reveal_count=1, incremented). Second cast (same cookie) → received a DIFFERENT seed, never own. 5 more advice casts → 5 different seed bottles, all from reveal_count=0 tier (tier rotation), never own IDs. PII on exchange → pii_rejected, NO received bottle (exchange blocked). GET /api/messages/exchange → 405 (no read bypass). Dev log: no errors.
  Agent Browser: cleared cookies (fresh user) → typed message + Advice → submit → "Sealing your bottle…" loading → throw animation → received bottle appeared ("A bottle drifted back to you", Advice+English badge, from a different session's real message — own-message exclusion works across sessions). Drifting confirmation auto-cleared; received bottle persisted with Dismiss. Composer reset (textarea empty, button disabled). Cast a second Venting bottle → received a different Venting seed ("Nobody warns you how lonely…"), not own. Feed refreshed with both own casts. Mobile (iPhone 14): category chips wrap to 2 cols, composer + feed visible. Console + page errors clean. bun run lint clean.

Stage Summary:
- Deliverables: Prisma isSeed field + index, scripts/seed-bottles.ts (25 curated en/ar seeds), src/lib/anonymous-session.ts (HTTP-only cookie + SHA-256), src/app/api/messages/exchange/route.ts (reciprocal-unlock, single transaction, no GET), src/components/bottle/{types,received-bottle}.tsx, composer wired to exchange, page info updated.
- Reciprocal-unlock is entirely server-side in ONE $transaction: insert own → select lowest-reveal_count tier (excluding own session hash, optionally matching lang/category, cold-start seed inclusion when real pool <20, filter relaxation) → increment reveal_count → return own + received. There is NO separate read endpoint (GET → 405), so a client cannot receive without writing.
- Own-message exclusion: authorId = sha256(session cookie); selection pool excludes authorId === own hash. Verified across 7 casts — never received own message, even across different browser sessions.
- Even exposure: tier-based selection (min reveal_count, random within tier) rotates bottles fairly. Verified: 5 consecutive advice casts returned 5 different seeds, all from the reveal_count=0 tier.
- Cold-start: 25 curated seed bottles (is_seed=true) backfill the pool. Seeds are served when the real (non-seed) pool < 20; they retire from the exchange once the community has 20+ real messages (remain visible in the browse feed).
- Moderation alignment: the exchange only hands back a received bottle when the author's message PASSES moderation (publish). Self-harm → support card (no bottle). Reject/pending → stored hidden, no bottle. PII → rejected before storage, no bottle.
- All lint-clean and browser-verified end-to-end. Dev server running on :3000.

---
Task ID: design-1
Agent: main (visual identity redesign)
Task: Design the visual identity for the anonymous "message in a bottle" web app — calm, oceanic, dusk-over-water; full RTL + Arabic font pairing; quiet writing screen with soft-glow textarea; throw-button micro-interaction; reveal screen with unfold animation; mobile-first; CSS/SVG + Framer Motion only. Output a Tailwind design system + the write and reveal screens fully coded.

Work Log:
- Read existing state (worklog, page.tsx, globals.css, layout.tsx, bottle-composer/throw-animation/received-bottle/feed, bottle-categories, language-detect). Functional exchange + moderation layer already complete from prior tasks.
- Rewrote src/app/globals.css as the dusk-over-water design system: OKLCH ocean tokens (--ocean-deep/mid/shallow, --sand-warm/glow, --moonlight, --foam), warm-pearl surface tokens, teal accent, warm-sand primary, night-sea dark variant. Added .ocean-surface gradient, .soft-glow textarea utility (resting bloom + focus ring), .glass-panel frosted utility, .throw-button sunset-pill, ripple/wave/horizon keyframes, .calm-scroll. Documented type scale (display→meta) + 4px spacing rhythm.
- Updated src/app/layout.tsx: loaded Cairo (Arabic+Latin) + Fraunces (display serif) via next/font/google, wired --font-cairo/--font-fraunces CSS vars; --font-sans stack now Geist→Cairo so Arabic glyphs fall back to Cairo. Added I18nGate, viewport themeColor, themed metadata.
- Created src/lib/i18n-store.ts: Zustand locale store (en/ar) with full EN+AR dictionary, useT() reactive hook, localStorage persistence, applyLocaleToDocument() (sets <html dir/lang>), pluralKey helper.
- Created src/components/bottle/i18n-gate.tsx: client gate that seeds locale from storage + reflects dir/lang on <html>.
- Created src/components/bottle/ocean-background.tsx: fixed dusk gradient + breathing horizon bloom + two layered SVG wave strips drifting at different speeds (CSS keyframes only) + moonlight vignette. Reduced-motion freezes drift.
- Added Arabic labels (labelAr/hintAr) to all four bottle categories in src/lib/bottle-categories.ts.
- Redesigned src/components/bottle/bottle-composer.tsx (WRITE screen): minimal-chrome nook (glass panel + top highlight), nostalgic display-serif heading + kicker, low-chrome tone pills that warm on select, soft-glow textarea (larger leading, focus bloom), live counter (muted→amber→red), warm sunset throw-button with press-scale + click-point ripple micro-interaction. Kept the full reciprocal-unlock exchange logic intact. Full i18n via useT().
- Redesigned src/components/bottle/received-bottle.tsx (REVEAL screen): Framer Motion choreography — card settles in → bottle glyph uncorks (tilt) → note unrolls top-to-bottom (clip-path wipe) → message text + badges fade in over paper panel with faint rule lines. Reduced-motion collapses to instant reveal. Teal "from the sea" treatment, anonymous, i18n.
- Tuned src/components/bottle/bottle-throw-animation.tsx to the new palette: teal launch ripples (water "plop", doubled for richness) + amber/teal sparkle droplets.
- Restyled src/components/bottle/bottle-feed.tsx: teal-tinted glass cards, calm custom scrollbar, i18n, hover lift.
- Created src/components/bottle/locale-toggle.tsx: glass pill showing the other language's name.
- Rewrote src/app/page.tsx: OceanBackground + slim sticky glass header (display-serif title + locale toggle) + quiet info banner + Tabs (The Sea / Admin review) + sticky glass footer (mt-auto). min-h-screen flex-col root.
- Fixed next/font config error (removed invalid weight+axes combo for Fraunces → plain variable font). Restarted dev server.
- Self-verified with Agent Browser + VLM:
  * Page renders clean (no console/page errors). Title correct.
  * Desktop: VLM confirms deep-teal→warm-sand dusk gradient, glassmorphic nook, calm/oceanic/nostalgic mood, subtle waves at bottom.
  * Write screen: tone chips, soft-glow textarea, throw button (disabled when empty). Cast flow works (POST /api/messages/exchange 200).
  * Reveal screen: received bottle article renders with real message text, category badge, time-ago, Dismiss — VLM confirms teal/ocean card + paper panel + gentle reward feel.
  * RTL/Arabic: dir="rtl" lang="ar" confirmed; Arabic copy throughout (رسالة في زجاجة, اكتب شيئًا صادقًا, ألقِ زجاجتك, عادت إليك زجاجة, إغلاق). VLM confirms RTL mirroring. Locale persists across reload.
  * Mobile (390×844): VLM confirms single-column stack, usable.
  * Sticky footer: root is `flex min-h-screen flex-col`, footer has `mt-auto`; long pages push footer down (verified 1323/1875px > viewport).
  * Lint clean.
- Solved dev-server persistence: sandbox reaps background processes between Bash calls; the subshell-detach pattern `( setsid bash -c 'exec bun run dev' </dev/null >>log 2>&1 & )` survives across calls (cross-call 200, ALIVE).

Stage Summary:
- Visual identity shipped: dusk-over-water ocean palette (deep teal → warm sand) with drifting SVG waves, warm-pearl "writing nook" with soft-glow textarea, sunset throw button with press ripple, paper-unroll reveal animation, full EN/AR RTL with Cairo + Fraunces + Geist pairing, mobile-first responsive, sticky footer. CSS/SVG + Framer Motion only (no new libraries).
- Design system lives in src/app/globals.css (ocean tokens, surface tokens, type scale, wave/glow/ripple utilities). Fonts in layout.tsx. i18n in src/lib/i18n-store.ts.
- All functional gates (PII + moderation + reciprocal-unlock exchange) preserved and working.
- Dev server running persistently on port 3000. Lint clean.

---
Task ID: reactions-1 (main), reactions-fe-1 (subagent)
Agent: main orchestrator (Z.ai Code) + general-purpose subagent
Task: Implement lightweight reactions on a revealed message — three reaction buttons (heart / smile / "I feel you") incrementing DB counters with per-session throttling; a single-line quick-word reply field (≤30 chars, PII-filtered) appended to the message's replies and visible ONLY to the original author via a signed-token "my bottle" link; no read receipts / notifications, fully async + anonymous.

Work Log:
- Read worklog + existing code (schema, pii-filter, exchange route, received-bottle, bottle-composer, page.tsx, i18n-store, globals.css, anonymous-session, quick-replies). Confirmed dusk-over-water identity + reciprocal-unlock exchange already shipped.
- Delegated Task reactions-fe-1 to a general-purpose subagent: created src/components/bottle/feel-you-icon.tsx (FeelYouIcon — two resonating sine waves meeting at centre, 24×24, currentColor, aria-hidden) and added 28 new i18n keys (reveal.react.*, reveal.reply.*, save.*, mybottle.*) to BOTH en + ar in src/lib/i18n-store.ts. Subagent returned lint-clean.
- Schema (prisma/schema.prisma): added reactionsHeart / reactionsSmile / reactionsFeelYou (Int @default 0) + privateToken (String? @unique, nullable so pre-existing rows backfill) to ExchangeMessage; added new BottleReply model (fully anonymous — no authorHandle, unlike the legacy QuickReply) + bottleReplies relation. Ran `bun run db:push` (in sync, client regenerated).
- Backend libs:
  * src/lib/reaction-throttle.ts — in-memory Map<string,number> TTL gate. checkThrottle(sessionHash, messageId, action, cooldownMs). REACTION_COOLDOWN_MS=5s, REPLY_COOLDOWN_MS=10s. Soft/ephemeral (resets on restart); keyed per session+message+action so reacting heart doesn't block smile. Lazy sweep at 20k entries.
  * src/lib/private-token.ts — generatePrivateToken() = randomBytes(24).base64url (192-bit, ~32 chars, URL-safe) + isValidTokenShape() syntactic guard.
- Backend API routes:
  * POST /api/messages/[id]/react — validates reaction kind, per-session throttle (5s), verifies parent is a published bottle, atomically increments the matching counter, returns authoritative counts. 429 on cooldown (soft).
  * POST /api/messages/[id]/replies — PII filter (reuse filterMessage) BEFORE insert, ≤30 chars, per-session throttle (10s), parent published check, inserts anonymous BottleReply. Returns {status:"published"}. pii_rejected returns notice+findings for inline highlight.
  * GET /api/my-bottle?token=… — validates token shape, looks up ExchangeMessage.privateToken, 404s on missing/non-published (never reveals moderation reason), returns the author's bottle + 3 reaction counts + replies list (newest-last, capped 200). Possession of token IS the authorisation.
- Wired private_token generation into both publish paths: src/app/api/messages/exchange/route.ts (generates ownPrivateToken in-transaction, sets on own create, returns private_token once in the published response) and src/app/api/messages/route.ts POST (same). Extended PublicBottle shape + BOTTLE_SELECT + toPublicBottle + GET feed select with the 3 reaction fields so the reveal screen can render starting counts; the public feed UI ignores them. Token NEVER exposed in GET /api/messages or to other readers.
- Frontend:
  * src/components/bottle/bottle-reactions.tsx — the interaction dock: 3 reaction pills (lucide Heart/Smile + custom FeelYouIcon, count, optimistic increment on tap, "Sent" pulse + check, 5s client cooldown mirroring server, 429 reverts + toast) + quick-word reply form (Input + Send, 30-char counter, PII rejection → compact PiiRejectedBanner, success → 4s "Your word is drifting to them." thanks). Reader never sees the reply list (private to author).
  * src/components/bottle/received-bottle.tsx — renders <BottleReactions> after the note unrolls (delay unroll+0.75) so the "small reward" reveal lands before affordances appear.
  * src/components/bottle/save-bottle-link.tsx — teal panel shown in the composer's drifting section after publish: builds /?bottle=<token> from window.origin, Copy button (Clipboard API + execCommand fallback), "Copied!" feedback, privacy note. Token comes from the exchange response.
  * src/components/bottle/bottle-composer.tsx — captures private_token from the exchange publish response (pendingPrivateToken ref → privateToken state), renders <SaveBottleLink> in both the drifting + lingering-received sections.
  * src/components/bottle/my-bottle-panel.tsx — the author's private reading room: fetches GET /api/my-bottle, shows kicker/title/intro + the author's own message on a paper panel + badges (category/lang/time/found) + 3-col reaction stat grid (Heart/Smile/FeelYou counts, tone-coloured) + the anonymous quick-word replies list (calm-scroll, paper chips, time-ago). Loading / notfound / error states; "Back to the sea" + Refresh.
  * src/app/page.tsx — reads ?bottle=<token> from window.location on mount (client-only, guarded regex, eslint-disable-next-line on the setState-in-effect with justification re: external-system sync + hydration), renders <MyBottlePanel> in place of the normal banner+tabs when a token is present; backToSea() replaceState's the URL clean. Sticky footer + header preserved.
- Restarted dev server so the running process picked up the regenerated Prisma client (the db singleton held the old client without BottleReply / new fields). `bun run lint` → exit 0 clean.
- Agent Browser end-to-end verification:
  * / loads normal view (47 bottles). Wrote "The tide always returns what the shore forgets." → throw → sea count 47→48, SaveBottleLink "Copy my link" appeared, received bottle revealed with Heart:0 / Smile:0 / I feel you:0 + quick-word field + Send + Dismiss.
  * Tapped Heart → count 0→1, button disabled (5s client cooldown). Dev log confirmed UPDATE...RETURNING on reactionsHeart (POST /react 200).
  * Sent quick-word "this landed gently, thank you" (29 chars) → field cleared, INSERT INTO BottleReply confirmed in dev log (POST /replies 200).
  * PII test: "call me at +20 100 555 1234" → compact PiiRejectedBanner "Removed it?" + notice + "phone number" badge, reply NOT stored. >30-char reply rejected with "Keep it to 30 characters." — both gates confirmed.
  * Extracted private token from the save-link <code> element; curl GET /api/my-bottle?token=… returned the author's bottle (0/0/0, empty replies). Seeded reactions + a reply via curl (fresh sessions): heart→1, smile→1, feel_you→1, reply "this reached me right now" published.
  * Navigated browser to /?bottle=<token> → MyBottlePanel rendered: "A PRIVATE READING ROOM / Your bottle / Here's what drifted back to your bottle." + the message + REACTIONS 1 HEARTS / 1 SMILES / 1 I FEEL YOU + QUICK WORDS "this reached me right now · just now".
  * "Back to the sea" cleared the URL to / and restored the normal write+feed view.
  * Invalid token (valid shape, no DB match) → gentle "This bottle link isn't valid or has drifted away." + Try again (no moderation reason exposed).
  * RTL/Arabic: dir="rtl" lang="ar"; reveal screen showed قلب:0 / ابتسامة:0 / أشعر بك:0 + اترك كلمة سريعة + انسخ رابطي; MyBottlePanel showed زجاجتك / العودة إلى البحر / تحديث.
  * Mobile (390×844): MyBottlePanel rendered single-column; footer pinned (top 755 within 844 viewport — no gap below).
  * No console errors / no hydration mismatches in dev.log across all interactions.

Stage Summary:
- Lightweight reactions shipped end-to-end: 3 reaction buttons (heart/smile/feel-you) increment DB counters (reactionsHeart/Smile/FeelYou) with per-session throttling (5s, in-memory, soft — no hard duplicate prevention, per spec); a ≤30-char quick-word reply field reuses the PII filter (phone/email/url/handles/long-IDs rejected before insert) and appends to a new fully-anonymous BottleReply table; replies + aggregate reactions are visible ONLY to the original author via a signed 192-bit private token in the URL (/?bottle=<token>) → MyBottlePanel reading room, no login. No read receipts, no notifications, no chat thread.
- New files: src/lib/reaction-throttle.ts, src/lib/private-token.ts, src/app/api/messages/[id]/react/route.ts, src/app/api/messages/[id]/replies/route.ts, src/app/api/my-bottle/route.ts, src/components/bottle/bottle-reactions.tsx, src/components/bottle/save-bottle-link.tsx, src/components/bottle/my-bottle-panel.tsx, src/components/bottle/feel-you-icon.tsx (subagent). Edited: prisma/schema.prisma, both message publish routes (token gen + reaction fields), received-bottle.tsx (dock after unroll), bottle-composer.tsx (save-link panel), page.tsx (token routing), i18n-store.ts (28 EN/AR keys), types.ts (reaction fields on PublicBottle).
- Design preserved: reactions dock fades in after the paper-unroll reveal; lucide Heart/Smile + custom FeelYouIcon (two resonating waves) keep the calm oceanic aesthetic vs raw emoji; MyBottlePanel reuses the teal "from the sea" treatment + paper panel. Full EN/AR RTL. Sticky footer intact. Lint clean. Dev server running on 3000.

---
Task ID: live-counter
Agent: main (direct implementation)
Task: Implement a live "Bottles exchanged today" counter in the header — backend count query filtered by start-of-today in Africa/Cairo (UTC+2/+3 DST), frontend polling every 15s with a smooth count-up/roll animation.

Work Log:
- Read worklog.md, prisma/schema.prisma, src/app/page.tsx, i18n-store.ts, api/messages/route.ts, api/messages/exchange/route.ts, bottle-composer.tsx, bottle-feed.tsx, globals.css, package.json, and dev.log to understand the existing architecture. Confirmed the project uses SQLite + Prisma (no Supabase/Postgres/Redis), so per the spec the "Redis counter" option was not applicable — used the Prisma COUNT approach with polling (the spec's explicit fallback).
- Created src/lib/timezone.ts: DST-correct `startOfTodayInZone()` using Intl.DateTimeFormat (no timezone DB lib needed). Verified: for Aug 7 2026 (Cairo EEST = UTC+3), midnight Cairo = 2026-08-06T21:00:00Z — confirmed by the API response.
- Created src/lib/exchange-stats.ts: `getTodaysExchangeCount()` counting published bottles (source="bottle", isHidden=false, moderationStatus="published") with createdAt >= start-of-today (uses the indexed createdAt column; for published rows createdAt ≈ publishedAt within the same transaction). Coalesced behind a 3s in-process TTL cache so the 15s client poll doesn't hammer SQLite; cache auto-expires across midnight so the counter resets promptly at local midnight without a cron.
- Created src/app/api/stats/today/route.ts: GET → { count, asOf, since } with Cache-Control: no-store.
- Added 3 i18n keys (EN + AR) to src/lib/i18n-store.ts: header.exchanged_today.{label,today,live}.
- Added CSS to src/app/globals.css: pulsing `live-dot` (core fade + expanding ring) and a `digit-roll-in` keyframe; added reduced-motion handling to freeze the dot.
- Created src/components/bottle/live-bottle-counter.tsx: client pill that polls /api/stats/today every 15s (plus on mount and on tab refocus via visibilitychange). Animates the number with framer-motion's imperative `animate(from, to)` (ease-out, 0.9s) — sampled during verification: 116→134→137, proving a real tween not an instant jump. Each new count remounts a keyed motion.span for a roll-in + scale pop. Honours prefers-reduced-motion (snaps, no tween). role="status" + aria-live="polite" + aria-label for a11y.
- Integrated <LiveBottleCounter /> into the header in src/app/page.tsx, grouped with the locale toggle in a shrink-0 right cluster so the title truncates (not the controls) on narrow viewports.
- Fixed an ESLint `react-hooks/set-state-in-effect` error by removing the pulseKey state (now use key={target}) and moving the reduced-motion snap into animate's onComplete callback (no synchronous setState in the effect body).
- Ran `bun run lint` → clean (0 errors).
- Verified end-to-end with Agent Browser:
  • Counter renders: aria-label "Bottles exchanged today: 50", role=status, aria-live=polite, live dot present.
  • Count-up animation tween confirmed: 116→134→137 (mocked count=137).
  • Live update: cast a benign bottle via the composer → counter incremented 49→50 on the next poll.
  • Mobile (375px): no horizontal overflow, title truncates, counter (98px) + locale toggle both visible.
  • Desktop (1280px): counter at right, 146px pill.
  • Arabic/RTL: htmlDir=rtl, aria="زجاجات بُدلت اليوم: 50", text "مباشر 50 اليوم".
  • Sticky footer: root min-h-screen flex-col + mt-auto footer; on long content footer pushed to document bottom (no overlap); mechanism correct for short-content pinning.
  • No console/runtime errors; /api/stats/today returning 200 (~7-11ms) consistently.

Stage Summary:
- New files: src/lib/timezone.ts, src/lib/exchange-stats.ts, src/app/api/stats/today/route.ts, src/components/bottle/live-bottle-counter.tsx.
- Edited: src/lib/i18n-store.ts (3 keys × 2 locales), src/app/globals.css (live-dot + roll-in + reduced-motion), src/app/page.tsx (header integration).
- Decision: used Prisma COUNT + 3s server cache + 15s client polling rather than Redis/Supabase Realtime, because the stack is SQLite/Prisma with no Redis/Supabase — polling is the spec's sanctioned fallback and is plenty "live" for a vanity counter.
- The counter resets at midnight Africa/Cairo (DST-correct) via the start-of-today recomputation; no daily cron needed because the 3s cache expires and recomputes against the new day boundary.
- All verification passed via Agent Browser; lint clean; dev server healthy.

---
Task ID: anti-spam
Agent: main (direct implementation)
Task: Implement rate limiting and anti-spam protection — 5 throws/24h + 10 reactions/1h per session (server-side), invisible Cloudflare Turnstile CAPTCHA on submit, Levenshtein near-duplicate detection, gentle error messages.

Work Log:
- Read reaction-throttle.ts, react route, bottle-reactions.tsx, pii-filter.ts, anonymous-session.ts, replies route, exchange route, composer, i18n-store to understand existing patterns. Confirmed session.hash (sha256 of cookie) is the per-browser identity for rate limiting. Stack is SQLite+Prisma (no Redis/Postgres), so used in-memory sliding window + DB backstop (the spec's "checking recent rows" analogue).
- Created src/lib/rate-limit.ts: atomic synchronous in-memory sliding window (consumeMemory, race-free) + durable DB backstop for throws. consumeThrowAttempt = memory(atomic) + DB count of stored submissions in 24h (survives restart). consumeReactionAttempt = memory only (short 1h window). Exports THROW_LIMIT=5, REACTION_LIMIT=10.
- Created src/lib/duplicate-detector.ts: normalizeForCompare (lowercase/trim/collapse-ws), iterative Levenshtein (O(m*n) time, O(min) space), distanceRatio, findNearDuplicate with DUPLICATE_THRESHOLD=0.2 (≤20% edit distance = duplicate), MIN_COMPARE_LEN=10. Pure/synchronous.
- Created src/lib/turnstile.ts: env-gated Cloudflare Turnstile verify. isTurnstileEnabled() checks TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY. verifyTurnstileToken bypasses (success:true) when not configured (dev/sandbox); fails closed on network error. extractClientIp from X-Forwarded-For.
- Created src/app/api/turnstile/config/route.ts: GET → { enabled, siteKey } (site key is public; secret never exposed). Verified: {"enabled":false,"siteKey":null} in sandbox.
- Added 8 i18n strings (EN+AR): error.rate_limited.throw.{title,body}, error.rate_limited.reaction, error.captcha.{title,body}, error.duplicate.{title,body}, write.captcha.checking.
- Wired exchange route (cost-ordered pipeline): validate → RATE LIMIT (5/24h, consume) → PII → CAPTCHA (Turnstile verify) → DUPLICATE (Levenshtein vs last 10 submissions, before LLM) → moderation → insert. All anti-spam gates return GENTLE 200 with status field (never raw 429).
- Wired react route: consumeReactionAttempt (10/1h) BEFORE the existing per-message 5s throttle. Gentle 200 rate_limited response.
- Created src/hooks/use-turnstile.ts: env-gated invisible widget hook. Fetches /api/turnstile/config; if enabled, loads Turnstile script + renders invisible widget (appearance:"execute") into a containerRef; ensureToken() returns token via ref (no stale closures); reset() for retry. Inert when disabled (no script, no widget). Refs created locally in composer (lint rule compliance).
- Edited bottle-composer.tsx: useTurnstile hook, hidden container div, captcha_token in submit body, new SubmitOutcome kinds (rate_limited/captcha_failed/duplicate), switch cases, OutcomeBanner gentle Alerts (amber for rate-limit, teal for captcha/duplicate) with Dismiss. useT() moved to top of OutcomeBanner (Rules of Hooks).
- Edited bottle-reactions.tsx: handle data.status==="rate_limited" (revert optimistic bump, gentle toast).
- Fixed lint: react-hooks/refs (ref ownership in composer), react-hooks/immutability (inlined loadScript/renderWidget into the effect), unused eslint-disable.
- Ran `bun run lint` → clean (0 errors).
- Verified end-to-end with Agent Browser (fresh isolated session):
  • Turnstile config fetched by browser (GET /api/turnstile/config 200); enabled=false → bypass, no external script loaded.
  • Happy path: bottle A published (captcha bypass + fresh session not blocked by rate-limit/dedup).
  • Duplicate: resubmitted A → gentle "You just sent that / let a different thought drift out" banner (fast, no LLM — dedup runs before moderation).
  • Throw rate limit: A(1,publish) + dup(2) + B(3) + C(4) + D(5,publish) → 6th (E) blocked with gentle "That's enough bottles for today / come back tomorrow 🌊" banner (fast, no LLM). E NOT in feed articles; D IS. Textarea retained (blocked, not published).
  • Reaction happy path: Heart 0→1 (no rate-limit toast).
  • Reaction rate limit (curl, 11 reactions to 11 bottles): #1-10 → ok, #11 → rate_limited with gentle notice "That's a lot of warmth for one hour — let the sea settle a little 🌊", limit=10, retry_after_ms=3594028 (~1h, accurate).
  • No console/runtime errors throughout.
- Note: captcha_failed path can't be triggered in sandbox (no Turnstile creds) but uses the same Alert UI as the verified duplicate/rate_limited paths; backend returns correct status when verification fails. Documented env-gated activation.

Stage Summary:
- New files: src/lib/rate-limit.ts, src/lib/duplicate-detector.ts, src/lib/turnstile.ts, src/app/api/turnstile/config/route.ts, src/hooks/use-turnstile.ts.
- Edited: src/lib/i18n-store.ts (8 strings × 2 locales), src/app/api/messages/exchange/route.ts (rate-limit+captcha+dedup gates), src/app/api/messages/[id]/react/route.ts (10/hour limit), src/components/bottle/bottle-composer.tsx (Turnstile + gentle outcomes), src/components/bottle/bottle-reactions.tsx (reaction rate-limit handling).
- Decisions: in-memory sliding window + DB backstop (no Redis available — spec's "checking recent rows" analogue); Turnstile env-gated (bypass in dev, active in prod with creds); Levenshtein ratio threshold 0.2; all anti-spam gates return gentle 200 (never raw 429); cost-ordered pipeline (rate-limit → PII → captcha → dedup → moderation) so bots/floods are rejected before the LLM.
- All verification passed via Agent Browser + curl; lint clean; dev server healthy.

---
Task ID: 3-b
Agent: general-purpose (throw-quota-api)
Task: Add a read-only GET /api/throw-quota endpoint that returns how many bottle throws the current anonymous session has left in the rolling 24h window, so the UI can show a friendly "2 of 5 bottles left" indicator. Implement a non-consuming peek function in rate-limit.ts to back it.

Work Log:
- Read /home/z/my-project/worklog.md to understand prior agents' work — confirmed prior tasks (anti-spam rate limiter, reactions, live counter) are all shipped and lint clean. Stack is Next.js 16 + Prisma + SQLite with the anonymous-session cookie (`bottle_session`) + sha256-hashed authorId pattern.
- Read src/lib/rate-limit.ts, src/lib/anonymous-session.ts, src/app/api/my-bottle/route.ts (JSDoc pattern), src/app/api/messages/exchange/route.ts (finalize() cookie-set helper, runtime/dynamic exports), src/app/api/stats/today/route.ts (Cache-Control pattern). Confirmed consumeThrowAttempt's structure: atomic in-memory consumeMemory (race-free) → DB backstop count+min → tighter-remaining report.
- Modified src/lib/rate-limit.ts — added `peekThrowRemaining(sessionHash)` export. Mirrors consumeThrowAttempt MINUS the in-memory `arr.push(now)` record step. Uses the existing private `pruneKey` helper to peek the in-memory window without pushing. Computes the same DB-backstop count+min via Promise.all. Returns the tighter of (memRemaining, THROW_LIMIT - dbCount) with NO "-1" because peek doesn't consume. Includes blocked-path with retryAfterMs computed from the oldest timestamp (memory or DB). Full JSDoc explaining the "attempts consumed vs bottles published" distinction and the post-restart DB-backstop durability.
- Created src/app/api/throw-quota/route.ts — GET handler. Calls `getSessionFromRequest(req)` then `peekThrowRemaining(session.hash)`. Returns the spec-mandated JSON shape: `{ limit, used, remaining, window_ms, retry_after_ms }`. Sets `Cache-Control: no-store, max-age=0` (per-session value, changes on every throw). Sets the `bottle_session` cookie on first-time visitors via `setSessionCookieOnResponse(res, session)` so the next call carries a stable identity. `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"` per spec. JSDoc header block follows the my-bottle/route.ts pattern, documenting the two-source peek (in-memory + DB), the cookie-set-on-new-session behavior, and the non-consuming semantics.
- Ran `bun run lint` → exit 0, clean (no warnings, no errors). Also ran `bun run tsc --noEmit` → only unrelated pre-existing errors in examples/ and skills/ dirs (socket.io-client, image-edit) — none in src/.
- End-to-end verification via curl against the running dev server (port 3000):
  * Fresh GET (no cookie) → 200, Set-Cookie: bottle_session=…; HttpOnly; SameSite=lax; Max-Age=31536000. Body: `{"limit":5,"used":0,"remaining":5,"window_ms":86400000,"retry_after_ms":0}`.
  * Returning GET (with cookie) → 200, NO Set-Cookie (stable identity). Same 5/5 body — confirms the peek is non-consuming (multiple GETs don't decrement).
  * Published a real benign bottle via POST /api/messages/exchange → 200 `{"status":"published",...}`. Subsequent GET /api/throw-quota → `{"limit":5,"used":1,"remaining":4,"window_ms":86400000,"retry_after_ms":0}` — confirms the DB-backstop path correctly decrements `used` and `remaining` after a stored submission.
  * Verified response headers: `Cache-Control: no-store, max-age=0` and `content-type: application/json` present on every call.
- Note on dev-mode in-memory peek: in Next.js dev mode, HMR can re-evaluate the rate-limit.ts module between requests, wiping the module-level `windows` Map. This is a known characteristic of the existing rate limiter (documented as "per-process" in rate-limit.ts) — it does not affect production (no HMR) and the DB backstop remains the durable source of truth. The peek function's in-memory code path is verified correct by inspection (mirror of consumeThrowAttempt minus push).

Stage Summary:
- New file: src/app/api/throw-quota/route.ts — GET /api/throw-quota → `{ limit, used, remaining, window_ms, retry_after_ms }`, non-consuming, sets cookie on first visit, Cache-Control: no-store, runtime=nodejs + dynamic=force-dynamic.
- Modified: src/lib/rate-limit.ts — added `peekThrowRemaining(sessionHash): Promise<RateLimitResult>` export (mirror of consumeThrowAttempt without the in-memory push step; returns the tighter of in-memory and DB-backstop remaining). No changes to the existing consumeThrowAttempt / consumeReactionAttempt / Test helpers.
- Decisions: peek (not consume) so the indicator can be polled freely without spending quota; tighter-of-two (in-memory + DB) so the indicator reflects "attempts consumed" including PII/captcha/duplicate-rejected ones (visible in-memory) rather than only "bottles stored" (visible in DB); cookie set on first GET so the indicator has a stable session identity from the very first page-load (otherwise it would flip-flop between fresh sessions until the first POST).
- All verification passed via curl; lint clean (0 errors); tsc clean for src/; dev server healthy on port 3000.

---
Task ID: 3-a
Agent: general-purpose (wall-of-gems-builder)
Task: Build the "Wall of Gems" feature — a public, fully anonymised, top-20-most-reacted-messages-this-week section, refreshed daily, for the Message in a Bottle app.

Work Log:
- Read /home/z/my-project/worklog.md to absorb prior-agent context (Task 1 = reactions feature, Task 2 = crisis-resources research, Task 5 = throw-quota indicator). Re-used conventions: JSDoc header blocks, glass-panel + calm-scroll CSS classes, anonymous PublicBottle-style shapes, runtime=nodejs + dynamic=force-dynamic on API routes, useReducedMotion() choreography, locale-aware timeAgo() helper.
- Read reference files: src/lib/exchange-stats.ts (TTL cache pattern), src/app/api/stats/today/route.ts (route shape), src/app/api/messages/route.ts (anonymity contract + toPublicBottle shape), src/components/bottle/bottle-feed.tsx (card layout + timeAgo), src/components/bottle/received-bottle.tsx (reduced-motion pattern), src/components/bottle/my-bottle-panel.tsx (reaction row pattern with rose/amber/teal tone badges), src/components/bottle/feel-you-icon.tsx (custom glyph import), src/lib/i18n-store.ts (confirmed gems.* keys already defined for en + ar), prisma/schema.prisma (ExchangeMessage column names + indexes).
- Created src/lib/wall-of-gems.ts:
  * Exports `GemEntry` (the fully-anonymous shape: id, content, category, language, created_at, total_reactions, hearts, smiles, feel_yous — NEVER authorId / authorHandle / privateToken / moderation fields).
  * Exports `getWallOfGems(): Promise<{ gems: GemEntry[]; refreshedAt: number }>` — 24h lazy in-process cache (`CACHE_TTL_MS = 24h`). Same pattern as exchange-stats.ts but with a daily TTL — first request after expiry recomputes, everyone else in the window rides the cache. "Refreshed daily" semantics without a cron scheduler.
  * Exports `_resetWallOfGemsCacheForTests()` for test isolation.
  * Uses `db.$queryRaw<RawGemRow[]>\`...\`` tagged-template with parameterised date bound (`${since}` — computed at query time, not module load time, so a long-lived server always sees a fresh 7-day window) and parameterised LIMIT.
  * SQL: published + non-hidden + source='bottle' + createdAt >= since + total reactions >= 1 (zero-reaction bottles excluded from the wall), ORDER BY (reactionsHeart + reactionsSmile + reactionsFeelYou) DESC, LIMIT 20.
  * createdAt coerced via `new Date(r.createdAt).toISOString()` to handle both Date and ISO-string return shapes from better-sqlite3.
- Created src/app/api/wall-of-gems/route.ts:
  * `runtime = "nodejs"`, `dynamic = "force-dynamic"`.
  * GET → `{ gems, refreshed_at: ISOString }`. `Cache-Control: no-store, max-age=0` so proxies don't hold a stale snapshot (the 24h cache lives in-process on the origin only).
- Created src/components/bottle/wall-of-gems.tsx:
  * `"use client"`. Self-contained — header (kicker + heading + intro + "refreshed daily" badge + refresh button) + scrollable list. No outer <section> wrapper (will be embedded in a tab by the parent).
  * Fetches GET /api/wall-of-gems on mount and on manual refresh button click. Uses `useToast` for error toasts, keeps the previous list visible during refresh (only the skeleton shows on first load).
  * Loading / empty / error states all handled with glass-panel cards.
  * GemCard: glass-panel + amber gem glyph avatar + (language Globe badge + timeAgo) meta row + whitespace-pre-wrap/break-words content + reaction row (rose Heart badge, amber Smile badge, teal FeelYouIcon badge, amber Sparkles total-reactions badge pushed to the end via ms-auto).
  * framer-motion staggered entrance: per-card delay = min(index * 0.05, 0.4) — capped so a full wall of 20 doesn't make the last card wait >0.4s. useReducedMotion() collapses the entrance to an instant reveal.
  * timeAgo() helper mirrors the pattern in bottle-feed.tsx / received-bottle.tsx (ar vs en short form, falls back to toLocaleDateString for >7d, though the wall's 7-day window means that fallback is rarely hit).
  * All i18n keys used exactly as specified: gems.heading, gems.kicker, gems.intro, gems.empty, gems.refreshed, gems.total_reactions (with {n}), sea.refresh, sea.loading.
- Ran `bun run lint` → exit code 0, no errors. Ran `bunx tsc --noEmit` → only unrelated errors in examples/websocket/* and skills/* (not in any new file under src/).

Stage Summary:
- New file: src/lib/wall-of-gems.ts — `getWallOfGems()` + `_resetWallOfGemsCacheForTests()` + `GemEntry` interface. 24h lazy in-process cache. Raw SQL via `db.$queryRaw` with parameterised date bound and LIMIT. Fully anonymous output shape.
- New file: src/app/api/wall-of-gems/route.ts — GET endpoint, runtime=nodejs + dynamic=force-dynamic, Cache-Control: no-store. Returns `{ gems, refreshed_at }`.
- New file: src/components/bottle/wall-of-gems.tsx — `"use client"` component with header + scrollable list of glass-panel gem cards. Reduced-motion-aware staggered entrance via framer-motion. Rose/amber/teal reaction badges with Heart/Smile/FeelYouIcon. locale-aware timeAgo. Loading/empty/error states handled gracefully.
- Decisions: (1) Used `db.$queryRaw` instead of the Prisma query builder because Prisma can't `orderBy` a computed sum across three columns in a single pass; SQLite computes `(reactionsHeart + reactionsSmile + reactionsFeelYou)` natively. (2) Date bound computed at query time inside the function (not hoisted to module load) so a long-lived server always sees a fresh 7-day window. (3) Cache lives in-process (same pattern as exchange-stats.ts) — gives "refreshed daily" semantics without an external cron; the first visitor of each new day pays the DB hit. (4) Zero-reaction bottles excluded via `>= 1` in the SQL WHERE clause rather than a post-filter, so the LIMIT 20 always returns the top 20 with reactions (no padding with zero-reaction rows). (5) Skipped a per-card "rank" ribbon to stay spec-minimal — the spec lists 5 items per card and rank isn't one of them. (6) Total-reactions badge pushed to the end via ms-auto for a clean per-kind-vs-total visual hierarchy. (7) Skeleton only shows on first load; subsequent refreshes keep the current list visible (only the refresh button spins) so the UX doesn't flash empty during a manual refresh.
- All verification passed: `bun run lint` exit 0; `bunx tsc --noEmit` shows no errors in src/. No existing files modified. Ready for the parent tab integration (next sub-task will likely add a `<TabsTrigger value="gems">` to src/app/page.tsx and place <WallOfGems /> inside it).

---
Task ID: 4-8 (integration)
Agent: main (Z.ai Code)
Task: Integrate 5 optional features (Wall of Gems, Time Capsule, Impact Indicator, Language Filter, Daily Bottle Cap) into the Message in a Bottle app.

Work Log:
- Read worklog.md to understand prior work (rate-limit/anti-spam system, Wall of Gems subagent 3-a, Throw Quota API subagent 3-b).
- Added `visibleAfter DateTime?` column to ExchangeMessage in prisma/schema.prisma + @@index([visibleAfter]). Ran `bun run db:push` to migrate.
- Added EN+AR i18n strings for all 5 features in src/lib/i18n-store.ts (quota.*, capsule.*, langpref.*, gems.*, impact.* keys + nav.gems). Used the singular/_plural key pattern for impact.poetic.* since t() does simple {name} interpolation only.
- Wired Time Capsule into src/app/api/messages/exchange/route.ts: added CapsuleDelay type (now|24h|7d|1y), parseCapsuleDelay(), computeVisibleAfter(). The INSERT stores visibleAfter; the selectReceivedBottle pool filters with OR: [{visibleAfter: null}, {visibleAfter: {lte: now}}] so future-capsuled bottles are excluded. Response echoes capsule_delay + visible_after.
- Created 3 new UI components:
  - src/components/bottle/throw-quota-indicator.tsx — polls GET /api/throw-quota, shows "X of 5 bottles left" with 5-dot progress, tone shifts teal→amber→rose.
  - src/components/bottle/time-capsule-picker.tsx — 4 radio pills (Now/24h/7d/1y) + note when delay selected.
  - src/components/bottle/language-pref-picker.tsx — 2-option toggle (Any language / Arabic) + relaxation note.
- Integrated all 3 into bottle-composer.tsx: quota indicator in the header row, language pref + time capsule pickers side-by-side after the tone selector. POST body includes visible_after_delay + language. Quota refreshes after publish. Drift section shows capsule confirmation alert when delay != "now".
- Added ImpactSummary component to my-bottle-panel.tsx: composes poetic phrases from reaction counts ("touched 8 hearts and made someone smile 6 times") using pluralKey() for singular/plural. Empty state shows "still drifting" message.
- Added Wall of Gems tab to page.tsx (3-column tab list: The Sea / Wall of Gems / Admin review).
- Fixed two bugs in wall-of-gems.ts (created by subagent 3-a): (1) Prisma stores DateTime as INTEGER epoch-ms in SQLite, not ISO TEXT — changed the raw SQL date bound from an ISO string to a number. (2) Raw SQL integer columns return as BigInt — wrapped all numeric fields in Number() so JSON.stringify can serialize them.
- Fixed lint error in throw-quota-indicator.tsx: added eslint-disable-next-line react-hooks/set-state-in-effect for the async fetch pattern.
- Regenerated Prisma Client (bun run db:generate) after schema change; restarted dev server to pick up the new client.
- Seeded reactions on 10 existing bottles to populate the Wall of Gems for verification.
- Agent Browser end-to-end verification (all 5 features):
  1. Wall of Gems: tab shows 13 gems sorted by total reactions, with language badges + reaction counts.
  2. Time Capsule: selected "In 24 hours", threw a bottle — drift section shows "In 24 hours" + "sealed and stored now" confirmation. API test confirmed visibleAfter set to 2026-08-14 (7d). DB test confirmed 1 future-capsuled bottle excluded from the 55-bottle exchange pool.
  3. Impact Indicator: opened /?bottle=<token> — shows "YOUR BOTTLE'S IMPACT" + "Your bottle has been found. touched 8 hearts and made someone smile 6 times."
  4. Language Filter: "Any language" / "Arabic" radio toggle present, preference sent to exchange endpoint.
  5. Daily Bottle Cap: indicator shows "5 of 5 bottles left" initially, updates to "4 of 5 bottles left" after a throw.
- Verified Arabic locale: all new strings render correctly (جدار الجواهر, بقيت 4 من 5 زجاجات, أرني زجاجات بـ, أي لغة, العربية).
- Final lint: clean (0 errors, 0 warnings).

Stage Summary:
- All 5 optional features implemented, integrated, and verified end-to-end in both EN and AR.
- Schema: added visibleAfter DateTime? column (indexed) to ExchangeMessage.
- New files: throw-quota-indicator.tsx, time-capsule-picker.tsx, language-pref-picker.tsx (components); wall-of-gems.ts, wall-of-gems route, throw-quota route (from subagents).
- Modified files: prisma/schema.prisma, i18n-store.ts, messages/exchange/route.ts, bottle-composer.tsx, my-bottle-panel.tsx, page.tsx, rate-limit.ts (peekThrowRemaining from subagent), wall-of-gems.ts (BigInt + epoch-ms fixes).
- No lint errors, no runtime errors, dev server stable.

---
Task ID: remove-ai-messages
Agent: main
Task: Remove AI/system-generated seed messages from the Message in a Bottle app ("شيل رسايل الذكاء الاصطناعي")

Work Log:
- Explored the codebase to identify what "AI messages" referred to: the pre-seeded starter bottles (is_seed = true) inserted by scripts/seed-bottles.ts. These system-generated messages appeared in the public browse feed, the Wall of Gems, and the reciprocal-unlock exchange pool (cold-start fallback).
- Updated GET /api/messages (src/app/api/messages/route.ts) to filter `isSeed: false` so the browse feed only shows real, user-authored bottles.
- Updated the Wall of Gems SQL query (src/lib/wall-of-gems.ts) to add `AND isSeed = 0` so the wall never surfaces seed content.
- Updated the reciprocal-unlock exchange (src/app/api/messages/exchange/route.ts):
  * Removed the `includeSeeds` parameter from `selectReceivedBottle` and hardcoded `isSeed: false` in the selection WHERE clause.
  * Removed the cold-start count check (`realEligibleCount < COLD_START_THRESHOLD`) and the `includeSeeds` variable from the POST handler.
  * Removed the now-unused `COLD_START_THRESHOLD` constant and updated the file-header docstring to reflect that seeds are always excluded.
- Created scripts/delete-seeds.ts (one-shot housekeeping using the project's @/lib/db client) and ran it: deleted 25 seed bottle rows from the database. 32 real (non-seed) published bottles remain.
- Retired scripts/seed-bottles.ts into a clear no-op so re-running it cannot re-introduce seed content.
- Verified with Agent Browser: the / route renders cleanly, the feed heading reads "Bottles in the sea 32" (matches the real-bottle count exactly), the Wall of Gems tab loads and returns 13 real gems, no console/runtime errors. curl checks confirmed /api/messages returns 32 non-seed bottles and /api/wall-of-gems returns 13 non-seed gems.
- `bun run lint` passes with zero errors.

Stage Summary:
- All pre-seeded "AI messages" (is_seed = true) have been purged from the database (25 rows deleted) and blocked from every read surface via `isSeed: false` filters.
- Surfaces updated: GET /api/messages (browse feed), src/lib/wall-of-gems.ts (Wall of Gems SQL), src/app/api/messages/exchange/route.ts (reciprocal-unlock pool — cold-start logic removed entirely).
- scripts/seed-bottles.ts is now a no-op; scripts/delete-seeds.ts is the one-shot purge utility.
- The app now surfaces ONLY real, user-authored bottles everywhere. If the real pool is empty on a fresh deployment, the exchange returns `received: null` and the client shows the "still drifting" empty state.

---
Task ID: wipe-all-test-data
Agent: main
Task: User clarified "these aren't users, I haven't even published the site yet" — so ALL content in the DB is test/development data, not real users. Wipe everything so the app starts truly empty for launch.

Work Log:
- Inspected the 32 non-seed bottle rows: all were test content created during dev/verification (patterns like "Bottle number 1/2/3 drifting out", "This is my first bottle cast into the sea", a few sessions each creating multiple bottles). One author had 7 bottles, another 4, another 3 — clearly test sessions, not real users.
- Also found 13 source="exchange" rows (legacy exchange board test data), 1 QuickReply, 2 BottleReplies, and 46 ModerationLog rows — all test data.
- Created scripts/wipe-test-data.ts: deletes all BottleReply, QuickReply, ModerationLog, then all ExchangeMessage rows (both sources). Cascades handle related rows but the explicit deletes are a safety net for orphans.
- Ran the wipe: deleted 2 BottleReply + 1 QuickReply + 46 ModerationLog + 45 ExchangeMessage rows. DB now has 0 rows across all content tables.
- Discovered the Wall of Gems was still serving 13 stale gems from its 24h in-process memory cache (src/lib/wall-of-gems.ts module-level `cache` variable), populated before the wipe. The cache TTL is 24h and there's no API to invalidate it.
- Killed and restarted the dev server (bun run dev) to clear the in-memory cache. After restart: /api/messages → {"messages":[]}, /api/wall-of-gems → {"gems":[]}, /api/stats/today → {"count":0}. All surfaces now truly empty.
- Verified in Agent Browser: the feed heading reads "Bottles in the sea" (no count badge), no console/runtime errors. Took screenshot sea-truly-empty.png.
- Removed temporary inspect scripts (inspect-bottles.ts, inspect-all.ts). Kept wipe-test-data.ts as a reusable launch-prep utility.
- bun run lint passes clean.

Stage Summary:
- The database is now completely empty of all test/development content: 0 bottles, 0 exchange messages, 0 quick replies, 0 bottle replies, 0 moderation logs.
- All three read surfaces confirmed empty after dev-server restart (which cleared the Wall of Gems in-memory cache): browse feed, Wall of Gems, today's stats counter.
- scripts/wipe-test-data.ts is available as a reusable launch-prep utility to wipe test data before going live.
- The app is ready for launch — the sea is empty and will only fill with real, user-authored bottles once actual users start casting.

---
Task ID: visual-polish-pass
Agent: main
Task: Full visual and interaction polish pass on the Message in a Bottle app — refine design system, motion, responsiveness. No functionality changes.

Work Log:
- Audited the existing design system: OKLCH oceanic palette (deep teal → warm sand), Fraunces+Geist+Cairo font pairing, framer-motion infrastructure. Confirmed the palette is already specific to "anonymous notes carried by water" — not a generic template. Identified 6 gaps: breakpoint-jumpy type scale (no clamp()), Arabic typography lacks vertical breathing room, throw→reveal hard cut, reaction tap targets <44px, expensive backdrop-blur with no low-end fallback, reaction bounce uses keyframes not spring physics.
- globals.css design token refinements:
  * Added fluid type scale via clamp() utilities: .type-display (28→40px), .type-h1 (24→30px), .type-h2 (18→22px), .type-lead (14→16px), .type-body-lg (15→17px). All scale smoothly between mobile and desktop instead of jumping at breakpoints.
  * Added fluid base font-size on body (15px → 16px via clamp).
  * Arabic RTL typography: [dir="rtl"] gets line-height 1.85 (vs Latin 1.6), letter-spacing 0 (Arabic must never have tracking — breaks cursive joining). Added .note-body class with line-height 2 for Arabic message text (extra room for diacritics). Cairo replaces Fraunces for display headings in RTL with line-height 1.5.
  * Enhanced keyboard focus: :focus-visible gets 2px solid ring + 2px offset for WCAG AA visibility on glass panels.
  * Low-end device fallback: .glass-panel backdrop-filter degrades gracefully — skips blur entirely under prefers-reduced-data, reduces to 8px blur on coarse-pointer (touch) small screens. Wave parallax animation freezes on low-end touch devices (static gradient is still beautiful).
- Motion orchestration (bottle-composer.tsx):
  * Wrapped the drift section (drift banner → capsule alert → save link → received bottle) in a staggered motion.div sequence with 0.05s/0.12s/0.2s/0.3s delays so the eye follows a clear path: "your bottle is drifting" → "save it" → "here's what came back". Collapses to instant reveal under prefers-reduced-motion.
  * Updated the throw overlay (bottle-throw-animation.tsx) to use motion.div with exit opacity fade, so the handoff from throw animation → drift section feels like the bottle dissolving into the distance, not a hard cut.
  * Reaction buttons (bottle-reactions.tsx): switched from keyframe scale array to framer-motion spring physics (stiffness 400, damping 14) for a more satisfying bounce. Bumped scale peak from 1.35 to 1.4.
- Responsiveness & tap targets:
  * Updated all major headings to fluid type: write.heading, gems.heading, mybottle.title all use .type-h1. Subhead/intro text uses .type-lead. Note bodies use .type-body-lg + .note-body.
  * Category pills: replaced py-2.5 with min-h-[44px] (WCAG touch target).
  * Reaction buttons: replaced py-1.5 with min-h-[44px], bumped px-3 to px-3.5.
  * Reply input + submit button: bumped from h-9 to h-11 (44px) for comfortable one-handed mobile use.
- Self-critique with VLM analysis at 4 viewport widths (360/390/768/1280px) + Arabic RTL:
  * Writing screen at 390px: "successfully evokes the theme... feels like a custom experience rather than a generic template. Every element serves a function."
  * Arabic RTL at 390px: "layout mirrors correctly. Icons positioned properly. Arabic text is highly readable with generous line-height. No overlapping or misalignment."
  * Desktop at 1280px: "centered container prevents stretching, creates a focused 'quiet space'. Header elements well-positioned."
  * Keyboard focus: "clear, high-contrast teal focus ring on the focused element."
  * No decorative element needed cutting — VLM confirmed "Every element serves a function... without feeling like clutter."
- bun run lint passes clean. Dev server compiles without errors. No runtime errors in dev.log.

Stage Summary:
- Design system refined with fluid clamp() typography (no more breakpoint jumps), proper Arabic RTL typography (generous line-height, zero letter-spacing), low-end device fallbacks (backdrop-blur degradation, wave animation freeze), and enhanced WCAG AA focus states.
- Motion orchestrated into a single coherent sequence: throw arc fades out → drift section staggers in (banner → save → received) → reveal card unrolls. Reaction taps use spring physics for a satisfying bounce.
- All interactive elements meet 44px minimum tap targets. Verified at 360px, 390px, 768px, 1280px, and Arabic RTL — no layout issues, no over-design.
- No functionality changed. No decorative elements cut (VLM confirmed all serve a purpose).

---
Task ID: color-system-theme-toggle
Agent: main (Z.ai Code)
Task: Refine the color system for the "Message in a Bottle" app and add a light/dark mode toggle with the user's concrete "daylight sea-glass" / "night sea" palette tokens. Keep all functionality unchanged.

Work Log:
- Read worklog.md to absorb prior context (visual-polish-pass, wipe-all-test-data). Audited the existing OKLCH-based design system in globals.css and the hardcoded teal/amber/rose Tailwind palette classes used across 12+ bottle components.
- Rewrote globals.css color system with the user's exact hex tokens as CSS custom properties on :root (light = "daylight sea-glass") and .dark (dark = "night sea"):
  * Light: --background #F1F6F5 (sea-foam white), --surface #FBF8F0 (warm parchment), --primary #0F6B63 (deep sea teal), --accent #C98A4B (aged brass amber), --foreground #16302C (near-black teal), --muted-foreground #5C7370.
  * Dark: --background #0B1A1E (deep ocean night), --surface #122629 (lifted card), --primary #4FD1C0 (glowing teal), --accent #E7B368 (moonlit amber), --foreground #E7EFEE, --muted-foreground #93A6A3.
  * Semantic flip: --primary is now TEAL (was amber/sand); --accent is now AMBER (was teal). The throw-button CSS was updated to use --accent (amber) + --accent-foreground (deep warm ink #2A1A0A) so the throw button keeps its brass glow while all other buttons/links become teal.
- Extended the Tailwind teal/amber/rose/cyan color scales via @theme inline to be THEME-AWARE: each scale stop (--teal-50..900, --amber-50..900, --rose-50..600, --cyan-50) is a CSS variable redefined per-mode. This means existing component classes like text-teal-700, bg-amber-50, border-rose-200 automatically resolve to brighter values in dark mode — fixing the most common dark-mode bug (low-contrast icons) without touching every component.
- Dark-mode ocean pass: retuned --ocean-deep/mid/shallow, --sand-warm/glow, and added --ocean-bloom, --ocean-vignette, --wave-slow, --wave-fast, --wave-foam-line, --reveal-wash, --paper-top/bottom, --paper-rule as theme-aware tokens. The night ocean is deeper with a dim warm moonlit horizon (not washed out), and the wave layers use glowing teal + warm amber at controlled opacity.
- Paper note in dark mode: set to DIMMED WARM PARCHMENT (#2a2218 / #221b13) rather than dark teal — a real note pulled from the sea at night is still paper (warm, aged), not an inverted cool panel. VLM confirmed it now "reads as warm aged parchment."
- Replaced all hardcoded OKLCH inline styles in ocean-background.tsx, received-bottle.tsx, my-bottle-panel.tsx, bottle-composer.tsx with the new CSS variables. Updated .throw-button, .soft-glow, .glass-panel, .calm-scroll to use color-mix() with theme tokens instead of hardcoded OKLCH.
- Cross-fade transition (280ms ease on background-color/border-color/color/fill/stroke/box-shadow) added to html, body, .glass-panel, .ocean-surface, .throw-button, .soft-glow. Only color properties transition (no layout shift). prefers-reduced-motion collapses it to instant.
- Created src/components/theme-provider.tsx (next-themes wrapper: attribute="class", defaultTheme="system", enableSystem, storageKey="theme"). Created src/components/bottle/theme-toggle.tsx (sun/moon icon button with framer-motion cross-fade, mount-gate placeholder to prevent hydration mismatch, 44px touch target on mobile, aria-label "Switch to dark/light mode").
- Wired into layout.tsx (ThemeProvider wrapping I18nGate + children; adaptive viewport themeColor for light/dark) and page.tsx (ThemeToggle in header next to LocaleToggle + LiveBottleCounter).
- Updated 3 throw-button usages (bottle-composer, bottle-reactions, save-bottle-link) from text-primary-foreground to text-accent-foreground (the throw button is amber, so its text must be the dark warm ink that passes AA on amber, NOT the warm-white that passes on teal). Fixed save-bottle-link code input bg-white/80 → bg-background/80 (would have been a stark white box in dark mode). Fixed live-bottle-counter bg-white/55 → glass-panel (would have been a bright white pill in dark mode). Aligned locale-toggle + theme-toggle borders to border-border/60 for consistency.
- WCAG AA contrast verified (computed in browser, not estimated):
  * Light: foreground on bg 12.7:1; muted-fg on bg 4.65:1; primary on bg 5.95:1; accent-fg on accent 5.83:1.
  * Dark: foreground on bg 15.4:1; muted-fg on bg 6.97:1 (verified live in browser); primary on bg 9.64:1; primary on card 8.52:1; accent on bg 9.47:1; accent-fg on accent 8.96:1.
  * All body-text pairings pass AA (≥4.5:1) in BOTH modes.
- Agent Browser end-to-end verification:
  * Light mode desktop: VLM confirmed "highly cohesive and thematic... intimate, oceanic atmosphere... high contrast (likely meeting WCAG AA)... ocean background very intentional."
  * Dark mode desktop + mobile: VLM confirmed "full, intentional design pass, not a simple inversion... teal accents luminous... no critical invisibility bugs." Throw button "distinctly amber/brass... text in dark brown provides excellent contrast." Header toggles all visible. Tone pills + time-capsule pickers "visible but subdued, functional."
  * Theme toggle interaction: clean reload (no localStorage) → LIGHT (system pref, storage null ✓). Click toggle → DARK, localStorage 'theme'='dark' ✓, label updates to "Switch to light mode" ✓. Reload → remembers DARK ✓.
  * Reading room (/?bottle=<token>) in dark mode: warm parchment paper panel distinct and readable, reaction icons (heart/smile/feel-you) all visible, teal kickers/badges luminous.
  * Transition CSS confirmed live on body + glass-panel (280ms on color properties). No console errors.
  * Mobile (390px) both modes: header readable, touch targets ≥44px, no overflow, ocean looks great. VLM: "dark mode arguably even better than light mode for this app concept."
- Cleaned up: deleted 2 test bottles created during verification (DB back to 0 for launch). Removed temp token-retrieval scripts. bun run lint passes clean (0 errors).

Stage Summary:
- Color system fully refined per the user's concrete palette. Light = "daylight sea-glass" (sea-foam bg, warm parchment cards, deep teal primary, brass amber accent). Dark = "night sea" (deep ocean bg, glowing teal primary, moonlit amber accent, warm dimmed-parchment paper notes). All tokens are CSS custom properties on :root/.dark — no hardcoded hex in components.
- Light/dark toggle added: next-themes with attribute="class", defaultTheme="system" (respects prefers-color-scheme for first-time visitors), persists manual choice to localStorage. Sun/moon icon button in header with 280ms cross-fade transition (color properties only, no layout shift, reduced-motion-aware).
- Extended Tailwind teal/amber/rose/cyan scales to be theme-aware, so all existing text-teal-700 / bg-amber-50 / etc. classes auto-adapt — the most common dark-mode bug (low-contrast icons) is fixed systemically.
- WCAG AA verified in BOTH modes for every body-text pairing (all ≥4.5:1; most ≥6:1). Ocean/wave background retuned for dark mode (intentional, not washed out). Amber throw button glows in both modes. Paper note stays warm parchment in dark mode (physical-object metaphor preserved).
- No functionality changed. No console errors. Dev server stable. DB empty for launch.

---
Task ID: 5-split-composer
Agent: general-purpose (5-split-composer)
Task: Extract the OutcomeBanner sub-component (and the SubmitOutcome type) out of src/components/bottle/bottle-composer.tsx into a new file src/components/bottle/outcome-banner.tsx. Pure move-only refactor — no behavior, JSX, className, or copy changes.

Work Log:
- Read /home/z/my-project/worklog.md to absorb prior context (most recent: color-system-theme-toggle). Read src/components/bottle/bottle-composer.tsx in full (773 lines).
- Identified OutcomeBanner (lines 632–772): a 7-branch type-switch rendering Alerts / composed cards for each SubmitOutcome variant — published, pii_rejected (delegates to <PiiRejectedBanner/>), self_harm_blocked (delegates to <SelfHarmSupportCard/>), rejected, pending_review, rate_limited, captcha_failed, duplicate.
- Mapped OutcomeBanner's dependencies on the parent file: the `SubmitOutcome` discriminated-union type (lines 78–87) was used both by BottleComposer (`useState<SubmitOutcome | null>`) and as OutcomeBanner's `outcome` prop type. External imports used by OutcomeBanner: `useT` from `@/lib/i18n-store`; `Alert/AlertDescription/AlertTitle` from `@/components/ui/alert`; `SelfHarmSupportCard` + `type SelfHarmSupportPayload` from `@/components/exchange/self-harm-support`; `PiiRejectedBanner` from `@/components/exchange/pii-rejected-banner`; `type PiiFinding` from `@/lib/pii-filter`; lucide icons `ShieldAlert, Clock, Waves, Lightbulb, Check`.
- Verified no other file in src/ imports `SubmitOutcome` or `OutcomeBanner` (grep returned only bottle-composer.tsx) — safe to relocate both.
- Created /home/z/my-project/src/components/bottle/outcome-banner.tsx:
  * "use client" directive (parent file had one).
  * Exported `SubmitOutcome` type — defined HERE (not in bottle-composer.tsx) so both sides can import it without a circular dependency. Type definition copied verbatim (preserved the "anti-spam / rate-limit gentle outcomes" comment).
  * Exported `OutcomeBanner` function copied verbatim — identical JSX, classNames, copy ("Dismiss", "Message not published", "Held for a quick review", "Cast", "Your bottle is now floating in the feed.", localised `t("error.*")` keys), identical early-return structure, identical comment about hooks running unconditionally.
  * Added a file-level doc comment explaining the extraction.
  * Imported its dependencies directly (lucide icons, Alert, useT, SelfHarmSupportCard+type, PiiRejectedBanner, PiiFinding).
- Edited bottle-composer.tsx:
  * Added `import { OutcomeBanner, type SubmitOutcome } from "@/components/bottle/outcome-banner";` at the end of the import block.
  * Removed the `SubmitOutcome` type definition (now imported).
  * Removed the entire `function OutcomeBanner(...)` block (~140 lines).
  * Pruned now-unused imports:
      - lucide-react: removed `ShieldAlert` (was only used by OutcomeBanner). Kept `Lightbulb, Waves, Check, Clock` (still used by CATEGORY_ICONS / throw button / drift Alert / capsule Alert respectively).
      - `@/components/exchange/self-harm-support`: changed from `{ SelfHarmSupportCard, type SelfHarmSupportPayload }` to `{ type SelfHarmSupportPayload }` — BottleComposer still casts `data.support as SelfHarmSupportPayload` in handleSubmit, so the type import is still needed; only the component import was dead.
      - `@/components/exchange/pii-rejected-banner`: removed the whole import line (was only used by OutcomeBanner).
  * Left EVERYTHING ELSE untouched: form state machine, handleSubmit switch (8 outcome branches), throw animation orchestration, save-link panel, received bottle rendering, drift section, capsule confirmation, throw button + ripple micro-interaction, invisible Turnstile container, all comments.
- Verified: bottle-composer.tsx shrank from 773 → 616 lines; outcome-banner.tsx is 232 lines (component + type + doc comment + imports).
- Ran `bun run lint` → clean (no errors, no warnings). Output was just `$ eslint .`.
- Ran `npx tsc --noEmit` to confirm no new type errors: grep for "bottle-composer|outcome-banner" returned NO ERRORS. The 7 tsc errors that exist are all pre-existing and in unrelated files (examples/websocket, skills/, src/app/api/messages/exchange/route.ts PublicBottle re-export quirk + captchaToken null, src/lib/db.ts readonly log levels). None were introduced by this refactor.
- Verified dev server still compiles: tail of /home/z/my-project/dev.log shows `✓ Compiled in 272ms` and `✓ Compiled in 1451ms` and a successful `GET / 200 in 232ms (compile: 54ms, render: 178ms)` after the file save — the home page (which mounts BottleComposer) rendered cleanly with no error stack.

Stage Summary:
- OutcomeBanner + the SubmitOutcome discriminated union are now in src/components/bottle/outcome-banner.tsx (exported, "use client", documented). bottle-composer.tsx imports them via `import { OutcomeBanner, type SubmitOutcome } from "@/components/bottle/outcome-banner";`.
- Net change: +1 new file (232 lines), −140 lines from bottle-composer.tsx (now 616 lines). Three dead imports removed from bottle-composer.tsx (ShieldAlert icon, SelfHarmSupportCard component, PiiRejectedBanner). All other imports, the form state machine, submit logic, throw animation, drift/received/save-link rendering are byte-identical to before.
- Behavior is identical: same JSX, same classNames, same copy, same early-return order, same hook placement, same type. `bun run lint` clean; `npx tsc --noEmit` reports zero errors in either touched file; dev server compiled and served `/` with 200 after the edit.

---
Task ID: 5-split-mybottle
Agent: general-purpose (5-split-mybottle)
Task: Code-quality pass on src/components/bottle/my-bottle-panel.tsx — (A) fix misleading error-state copy, (B) extract the ImpactSummary sub-component into its own file. No visual/behavior changes beyond the one copy fix.

Work Log:
- Read /home/z/my-project/worklog.md to review prior work (crisis-resource research, prior task IDs 2–4).
- Read /home/z/my-project/src/components/bottle/my-bottle-panel.tsx in full (429 lines) and /home/z/my-project/src/lib/i18n-store.ts. Confirmed the new `mybottle.error` key already exists in both EN and AR dictionaries (i18n-store.ts lines 98 and 237).
- Confirmed `ImpactSummary` was referenced only inside my-bottle-panel.tsx (declaration + single usage) — no external importers, so extraction is safe.
- Confirmed `Sparkles` (lucide-react) and `pluralKey` (i18n-store) were used ONLY inside the `ImpactSummary` sub-component, so they could be dropped from my-bottle-panel.tsx's imports after extraction.

PART A — error-state copy fix:
- In the `error` branch of the LoadState (previously line 151), changed `t("mybottle.notfound")` → `t("mybottle.error")`. Now a network blip / 500 no longer shows the misleading "This bottle link isn't valid or has drifted away." copy; it shows "We couldn't reach your bottle just now — try again in a moment." (and the AR equivalent). The `notfound` branch still uses `t("mybottle.notfound")`. Retry button, toast, and all other behavior unchanged.

PART B — extract ImpactSummary:
- Created /home/z/my-project/src/components/bottle/impact-summary.tsx (new file, ~100 lines) containing the `ImpactSummary` component plus its `TFunc` alias, with `"use client"` directive and imports for `Sparkles` (lucide-react) and `useT`, `pluralKey` (@/lib/i18n-store). Props preserved exactly: `{ hearts, smiles, feelYous, revealCount, t }`. Component body, JSX, classNames, comments, and pluralization logic are byte-for-byte identical to the original — pure move.
- Edited my-bottle-panel.tsx:
    * Removed `Sparkles` from the lucide-react import (now unused in this file).
    * Removed `pluralKey` from the @/lib/i18n-store import (now unused in this file); kept `useI18n, useT`.
    * Added `import { ImpactSummary } from "@/components/bottle/impact-summary";` (alphabetically ordered after the feel-you-icon import).
    * Deleted the in-file `ImpactSummary` function, the `TFunc` type alias, and the preceding comment block (~103 lines removed). The single `<ImpactSummary … />` call site in the `ok` branch is unchanged.
- File shrank from 429 → 326 lines.

Verification:
- Ran `cd /home/z/my-project && bun run lint` → `$ eslint .` with zero errors/warnings.
- Checked `tail -n 20 /home/z/my-project/dev.log` after saving: dev server recompiled cleanly, `GET / 200 in 54ms (compile: 4ms, render: 50ms)` with no error/traceback lines. No TypeScript or import-resolution errors.
- No JSX, className, text, or logic was altered beyond the single error-copy substitution. No renames.

Stage Summary:
Completed both parts cleanly. (A) The `error` LoadState branch now renders `t("mybottle.error")` instead of the misleading `t("mybottle.notfound")`; the `notfound` branch is untouched. (B) `ImpactSummary` now lives in its own module `src/components/bottle/impact-summary.tsx` and is imported by `my-bottle-panel.tsx`; the now-unused `Sparkles` and `pluralKey` imports were pruned from the parent. Lint passes, dev server compiles, behavior is identical. No issues encountered.

---
Task ID: 5-split-admin
Agent: general-purpose (5-split-admin)
Task: Code-quality pass on src/components/exchange/admin-review.tsx — (A) fix actingId race condition by switching from string|null to Set<string>, and (B) extract ReviewItemCard + its private helpers into a new review-item-card.tsx. No visual/behavior changes beyond the bug fix.

Work Log:
- Read /home/z/my-project/worklog.md to absorb prior context (visual-polish-pass, color-system-theme-toggle, wipe-all-test-data). Read admin-review.tsx in full (~535 lines).
- Audited the file: the actingId state was a single `string | null`. The `act()` function set `actingId = id` on entry and `setActingId(null)` in `finally`. If a moderator triggered a second action on a different item while the first was still in flight, the second's `setActingId(secondId)` would overwrite the first's, and the first's `finally` would then clear the second's loading state prematurely. Classic race.
- Confirmed the helpers used by ReviewItemCard (flagLabel, statusLabel, decisionLabel, timeAgo, initials) are NOT referenced anywhere else in admin-review.tsx — they were only ever called from inside the ReviewItemCard JSX. Safe to move them wholesale to the new file with no prop-passing needed.
- Confirmed the ReviewLog and ReviewItem interfaces are needed by both the parent (state typing) and the card (prop typing), so the new file exports both and the parent imports `type ReviewItem`.
- Created src/components/exchange/review-item-card.tsx:
  * "use client" directive.
  * Exports: `ReviewItem`, `ReviewLog` (interfaces) and `ReviewItemCard` (component). Helpers `flagLabel`, `statusLabel`, `decisionLabel`, `timeAgo`, `initials` are module-private.
  * Imports: lucide-react `ShieldAlert, LifeBuoy, Check, Clock, X, Loader2, ScrollText` (Clock/X are used by statusLabel; the others by the card JSX); `Button`; `Card, CardContent, CardHeader, CardTitle`; `Badge`; `Input`; `Avatar, AvatarFallback`; full `AlertDialog*` set.
  * JSX, classNames, text, and logic copied verbatim from the original ReviewItemCard — no design/behavior changes.
  * The `acting` prop is still typed `boolean` and still controls the same `<Loader2>` spinner swap + `disabled={acting}` on the action buttons. The Set change is purely in the parent.
- Rewrote src/components/exchange/admin-review.tsx:
  * Replaced the actingId state: `const [actingIds, setActingIds] = useState<Set<string>>(new Set())` with a one-line comment explaining why a Set is needed.
  * `act()` now does `setActingIds((prev) => new Set(prev).add(id))` on entry, and in `finally`: `setActingIds((prev) => { const next = new Set(prev); next.delete(id); return next; })`. This means each item's loading state is tracked independently — a second concurrent action no longer clobbers the first.
  * The card receives `acting={actingIds.has(item.id)}` — same boolean contract as before.
  * Removed the duplicated `ReviewItem`/`ReviewLog` interfaces, the five helpers, and the entire ReviewItemCard function body. They now live in review-item-card.tsx.
  * Trimmed imports to only what the parent still uses: lucide-react `ShieldCheck, Clock, LifeBuoy, X, Loader2, RefreshCw` (dropped ShieldAlert, Check, ScrollText — those are only used by the card). Dropped `CardHeader, CardTitle, Badge, Input, Avatar, AvatarFallback`, and the entire `AlertDialog*` import block — all card-only. Kept `Card, CardContent` (still used by SummaryCard + the empty state). Added `import { ReviewItemCard, type ReviewItem } from "./review-item-card"`.
  * Everything else (SummaryCard, FILTERS, FilterKey, the summary grid, filters row, queue render branch, toast copy, load() / act() control flow) is byte-for-byte identical to the original.
- Verified: `bun run lint` exits 0 with no errors/warnings. Dev server (`tail -n 50 dev.log`) shows successful incremental compiles ("✓ Compiled in 592ms / 272ms / 1451ms") and no errors or warnings. `curl http://localhost:3000/` returns 200.

Stage Summary:
- Race condition fixed: `actingId: string | null` → `actingIds: Set<string>`. Concurrent moderator actions on different items no longer overwrite each other's loading state, and one action's `finally` no longer prematurely clears another's spinner. Spinner visibility and `disabled` behavior are otherwise identical.
- Component extracted: ReviewItemCard + its five private helpers (flagLabel, statusLabel, decisionLabel, timeAgo, initials) + the ReviewItem/ReviewLog interfaces moved to src/components/exchange/review-item-card.tsx. admin-review.tsx now imports `ReviewItemCard` and `type ReviewItem` from the new file. admin-review.tsx dropped from ~535 to ~212 lines.
- No JSX, className, text, logic, or behavior changed beyond the Set swap. No renames except the actingId → actingIds variable (which is the bug fix itself).
- `bun run lint` clean. Dev server compiles clean. No new features, no visual changes.

---
Task ID: 3-5 (main orchestrator)
Agent: Z.ai Code (main)
Task: Full code quality + bug-fix pass on the entire Message in a Bottle codebase — bug hunt, code cleanup, correctness/security review, final check. No visual/feature changes.

Work Log:
- Launched two Explore subagents to exhaustively map all 14 API routes, 16 lib utilities, and 24 frontend components/hooks. Identified the full bug surface.
- Created src/lib/api-helpers.ts — shared utilities extracted from 2-4× duplicated code across routes: parseJsonBody, getStringField, BOTTLE_SELECT, toPublicBottle, pickAnonymousHandle, generateAnonymousAuthorId, statusByDecision, finalizeResponse, sanitizeMessageId, sanitizeHandle, sanitizeContent, requireAdmin, noStoreResponse, serverErrorResponse, createTtlCache.
- Fixed src/lib/db.ts — gated Prisma query logging on NODE_ENV (was logging all SQL + params incl. message content in production = PII leak).
- Fixed src/lib/language-detect.ts — tightened LanguageCode from `string` to a precise union; made languageLabel accept `string` (honest for DB-sourced values).
- Refactored src/lib/exchange-stats.ts + src/lib/wall-of-gems.ts to use the shared createTtlCache; renamed __clearExchangeStatsCacheForTests → _resetExchangeStatsCacheForTests for consistency.
- Hardened ALL 11 API routes with top-level try/catch returning a gentle `status: "error"` 500 (previously every DB operation was unwrapped → unhandled 500).
- Added Cache-Control: no-store to /api/my-bottle (private reactions/replies) and /api/admin/review (private moderation queue) — were missing, risked CDN/browser caching of private data.
- Added requireAdmin gate to both admin routes — optional shared-secret (ADMIN_SECRET_TOKEN env var, checked via x-admin-token header or admin_token cookie). Active only when env var is set; no-op in dev/pre-publish so the dashboard stays usable without a login UI.
- Fixed /api/admin/review/route.ts — replaced `Record<string, unknown>` where-clause with proper `Prisma.ExchangeMessageWhereInput`.
- Fixed /api/admin/review/[id]/route.ts — added sanitizeMessageId (was passing raw URL param to Prisma), replaced unsafe `as AdminAction` cast with a type guard, wrapped in try/catch.
- Reordered PII gate to run BEFORE consumeThrowAttempt in /api/messages/exchange — a PII rejection (user error) no longer burns a daily-throw slot. Verified: quota showed 4/5 after 1 publish + 1 PII rejection.
- Reordered throttle/rate-limit to fire AFTER parent-existence check in /api/messages/[id]/replies and /api/messages/[id]/react — reacting to a moderated-away bottle or replying with PII no longer burns the cooldown/rate-limit slot.
- Removed orphaned POST /api/messages handler (no frontend used it; it lacked rate-limit/captcha/duplicate gates = spam + LLM-budget drain vector). Kept GET feed.
- Deleted dead code: /api/exchange/route.ts, /api/quick-replies/route.ts, components/exchange/exchange-board.tsx, components/exchange/quick-replies.tsx, hooks/use-mobile.ts, components/ui/sidebar.tsx, /api/route.ts (Hello-world boilerplate). All verified unused by any active component.
- Added i18n keys: reveal.reply.too_soon (EN+AR) and mybottle.error (EN+AR).
- Fixed bottle-reactions.tsx — timer cleanup via useRef+useEffect (prevented setState-on-unmounted); reply-429 now uses reveal.reply.too_soon (was reusing the reaction's string).
- Fixed throw-quota-indicator.tsx — added visibilitychange retry so the skeleton recovers if the first fetch fails (was stuck in skeleton forever).
- Fixed use-toast.ts — subscribe effect dependency [state] → [] (was re-subscribing on every toast change).
- Fixed live-bottle-counter.tsx — narrowed StatsResponse to {count} (removed unused asOf/since); removed target! non-null assertion.
- Fixed theme-toggle.tsx — simplified redundant className (h-8 w-8 + min-h-[44px] → min-h-[44px] sm:h-8 sm:w-8).
- Delegated 3 component splits to subagents (all verified clean): OutcomeBanner → outcome-banner.tsx (5-split-composer), ReviewItemCard → review-item-card.tsx + actingId→Set fix (5-split-admin), ImpactSummary → impact-summary.tsx + mybottle.error copy fix (5-split-mybottle).
- Ran `bun run lint` (clean) and `npx tsc --noEmit` (0 errors in src/; 1 pre-existing error in unrelated skills/ file).
- Verified end-to-end with Agent Browser: page render, write→submit→throw→reciprocal-reveal, heart reaction (incremented + visible to author), quick-word reply (stored + visible to author), my-bottle reading room, dark mode toggle, Arabic locale+RTL, Wall of Gems tab, Admin review tab, PII rejection (blocked + banner shown), quota indicator (confirmed PII doesn't burn slot), mobile+desktop responsive, sticky footer, no console errors.
- Wiped verification test data to restore the clean DB state.

Stage Summary:
- Bugs fixed: (1) PII rejection burning daily quota, (2) throttle/rate-limit burning slots on validation failures, (3) no try/catch on any DB operation in any route, (4) Prisma query logging in production (PII leak), (5) no Cache-Control on private endpoints, (6) no auth on admin routes, (7) unsafe type casts (as Record, as AdminAction), (8) timer setState-on-unmounted in BottleReactions, (9) reply-429 wrong i18n string, (10) mybottle error showing "drifted away" copy, (11) throw-quota skeleton stuck on first-fetch failure, (12) admin-review actingId race on concurrent actions, (13) use-toast re-subscribing on every state change, (14) non-null assertion on possibly-null target, (15) orphaned POST /api/messages (spam vector), (16) dead legacy endpoints /api/exchange + /api/quick-replies, (17) dead code use-mobile.ts + sidebar.tsx.
- Code quality: extracted 9 categories of duplicated logic into src/lib/api-helpers.ts; tightened LanguageCode type; split 3 oversized components (bottle-composer 773→616, admin-review 535→212, my-bottle-panel 429→326); consistent test-helper naming; removed all dead code.
- Security: server-side validation verified for all inputs (char limits, PII, moderation, category whitelist, token shape); rate-limiting + moderation + PII all confirmed to BLOCK the request path; no raw user input reaches DB unsanitised (Prisma parameterisation + input validators); admin gate added.
- Behavior is identical to before the pass — verified via full-flow Agent Browser testing. No visual changes, no new features.

---
Task ID: bugfix-theme-toggle-hydration
Agent: main (orchestrator)
Task: Fix hydration mismatch error on ThemeToggle aria-label/title (reported via console error)

Work Log:
- Read dev.log (server healthy, 200s on all routes).
- Located ThemeToggle at src/components/bottle/theme-toggle.tsx and ThemeProvider at src/components/theme-provider.tsx.
- Root-caused: the toggle gated the *icon* on `mounted` to avoid SSR/CSR mismatch, but `aria-label`/`title` were derived from `resolvedTheme` and rendered unconditionally. next-themes injects a blocking script that resolves `resolvedTheme` from localStorage synchronously on the client, so the first client render already saw "dark" (label "Switch to light mode") while the server render saw `undefined` (label "Switch to dark mode") -> attribute hydration mismatch.
- Fix: gate the directional label on `mounted` too. While not mounted, render a stable neutral label "Toggle theme" (same gate already used for the icon). After mount, swap to "Switch to light mode" / "Switch to dark mode" based on resolvedTheme. No visual change, no new feature — pure bug fix.
- Updated the component docstring to accurately reflect that resolvedTheme is NOT undefined during first client paint (correcting the misconception that caused the bug).
- Ran `bun run lint` -> clean (no warnings/errors).
- Verified with agent-browser:
  * Opened / -> no hydration error, no console warnings, no page errors.
  * Light path: label "Switch to dark mode" after mount.
  * Clicked toggle -> html class became "dark", localStorage theme=dark, label updated to "Switch to light mode".
  * Reloaded with theme=dark persisted (the exact scenario that originally triggered the bug) -> NO hydration error, label correctly "Switch to light mode".

Stage Summary:
- Bug fixed: hydration mismatch on ThemeToggle aria-label/title.
- Files changed: src/components/bottle/theme-toggle.tsx (label gated on `mounted`; docstring corrected).
- No visual/behavioral change beyond eliminating the console error. Toggle still flips light<->dark, persists to localStorage, and shows the correct directional label post-mount.
- Lint clean. Browser-verified on both light and dark reload paths.

---
Task ID: project-download-package
Agent: main (orchestrator)
Task: Package the entire project into a downloadable archive the user can grab via the preview URL.

Work Log:
- Inspected project root: node_modules (1.2G), .next (428M), skills/ (61M, sandbox tooling), .zscripts/ (sandbox dev tooling), various verification PNGs, and the SQLite db file.
- Created .env.example with a relative DATABASE_URL ("file:./db/custom.db") — the real .env had an absolute sandbox path (/home/z/my-project/db/custom.db) that wouldn't work on the user's machine.
- Created SETUP.md with prerequisites (Node 20+, Bun), install/run steps (bun install -> cp .env.example .env -> bun run db:push -> bun run dev), script table, and project layout overview.
- Built tarball excluding: node_modules, .next, .git, tool-results, download (old screenshots), skills, .zscripts, .z, .z-ai-config, upload, *.png, logs, db/custom.db, .env, tsconfig.tsbuildinfo, next-env.d.ts.
- Final archive: 287K, 164 files. Contains: all src/ (app, components, lib, hooks), prisma/schema.prisma, supabase/migrations, scripts, public, examples, tests, all config files (package.json, bun.lock, tsconfig, next.config, eslint, tailwind, postcss, components.json, Caddyfile), SETUP.md, .env.example, worklog.md.
- Attempted to serve via a download mini-service on port 3001, but the sandbox Bash tool kills background processes on command completion (systemd-run unavailable — init is tini, not systemd; setsid/nohup/disown all insufficient). Removed the mini-service.
- Final solution: copied the tarball into public/ so the already-running Next.js dev server serves it as a static file. Verified: HTTP 200, Content-Type: application/gzip, Content-Length: 293741, served through the gateway at /message-in-a-bottle.tar.gz (no XTransformPort needed — static files go to port 3000).
- Browser-verified: navigating to /message-in-a-bottle.tar.gz triggers ERR_ABORTED (= browser download, the expected behavior for application/gzip). App page (/) still loads clean, no errors.

Stage Summary:
- Download URL: /message-in-a-bottle.tar.gz (relative to the app/preview root).
- Archive: 287K, 164 files, valid gzip (verified by tar -tz extraction).
- To run locally: bun install -> cp .env.example .env -> bun run db:push -> bun run dev (port 3000).
- Temporary artifact: public/message-in-a-bottle.tar.gz can be deleted after download; it's excluded from the archive itself.
