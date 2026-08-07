# Message in a Bottle — local setup

A calm, anonymous message-in-a-bottle app: write a note, cast it into the sea,
let someone else reel it in, react, and reply. Built with Next.js 16, Prisma
(SQLite), Tailwind CSS 4, and shadcn/ui.

## Prerequisites

- **Node.js 20+** and **Bun** (https://bun.sh) — Bun is the package manager /
  runtime used in development.
- That's it. SQLite is a file-based DB, so there's no separate database server
  to install.

## Install & run

```bash
# 1. Install dependencies
bun install

# 2. Create your local env file from the example
cp .env.example .env

# 3. Create the SQLite database from the Prisma schema
bun run db:push

# 4. Start the dev server
bun run dev
```

The app runs on **http://localhost:3000**.

## Useful scripts

| Script | What it does |
| --- | --- |
| `bun run dev` | Start the Next.js dev server (port 3000). |
| `bun run lint` | Run ESLint. |
| `bun run db:push` | Push `prisma/schema.prisma` to the SQLite file (creates/migrates tables). |
| `bun run db:generate` | Regenerate the Prisma Client after schema changes. |
| `bun run build` | Production build (standalone output). |

## Project layout

```
src/
  app/
    api/            # All API routes (messages, exchange, reactions, replies,
                    # moderation, rate-limit, wall-of-gems, stats, turnstile)
    layout.tsx      # Root layout (ThemeProvider, fonts, metadata)
    page.tsx        # The single user-facing route (the whole app)
    globals.css     # Theme tokens, light/dark, ocean background
  components/
    bottle/         # App-specific UI (composer, feed, reactions, toggles, …)
    exchange/       # Moderation / PII / self-harm support UI
    ui/             # shadcn/ui component library
  lib/              # Shared utilities (db, rate-limit, pii-filter, moderation,
                    # anonymous-session, i18n, turnstile, wall-of-gems, …)
  hooks/            # use-turnstile, use-toast
prisma/schema.prisma  # Database schema (SQLite)
supabase/migrations/  # RLS policies (if you switch to Supabase instead of SQLite)
scripts/            # Maintenance scripts (seed, wipe, delete-seeds)
public/             # Static assets (logo, robots)
```

## Notes

- The database starts **empty**. The app works fine with zero bottles (the UI
  shows a calm "empty sea" state). There are no required seed accounts.
- Anonymous sessions are issued via a cookie (`mib-session`); no login is
  needed to write or read.
- `z-ai-web-dev-sdk` is a backend-only dependency — it powers the moderation
  / PII checks and must never be imported from client components.
