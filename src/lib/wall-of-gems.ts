/**
 * src/lib/wall-of-gems.ts
 * ---------------------------------------------------------------------------
 * "Wall of Gems" — the top 20 most-reacted bottles from the last 7 days.
 *
 * A public, fully anonymised showcase of the brightest messages that have
 * drifted through the sea this week. The wall is "refreshed daily": the
 * computed result (plus the moment it was computed) is memoised in an
 * in-process module-level variable for 24 hours. The first request after
 * the cache expires recomputes from the DB; every request inside the 24h
 * window gets the cached snapshot. This delivers the "refreshed daily"
 * semantics from the spec *without* requiring an external cron scheduler
 * — the first visitor of each new day pays the (small) DB hit, and everyone
 * else in that day rides the cache. (Same pattern as src/lib/exchange-stats.ts,
 * just with a 24h TTL instead of a 3s one — there the goal was to coalesce
 * many fast polls; here the goal is to never look at the DB more than once
 * per day.)
 *
 * Query: published (moderationStatus = "published"), non-hidden, source =
 * "bottle" bottles created within the last 7 days, ranked by total reactions
 * (reactionsHeart + reactionsSmile + reactionsFeelYou) descending, capped at
 * 20, EXCLUDING any bottle whose total reactions is 0 (a zero-reaction
 * bottle has no business being on the wall). The 7-day window is computed
 * against `createdAt` (indexed: @@index([createdAt])) for a fast range scan.
 *
 * Anonymity contract: the result exposes ONLY { id, content, category,
 * language, created_at, total_reactions, hearts, smiles, feel_yous }. NEVER
 * authorId, authorHandle, privateToken, moderationStatus, moderationFlagType,
 * moderationConfidence, or any moderation metadata. Same contract as the
 * public bottle feed (GET /api/messages) — the wall is a read-only projection
 * of that same anonymous surface.
 *
 * Implementation note: we use `db.$queryRaw` with a tagged-template parameter
 * for the date bound because Prisma's query builder can't `orderBy` a computed
 * sum across the three reaction columns in a single pass. Postgres computes
 * `("reactionsHeart" + "reactionsSmile" + "reactionsFeelYou")` per row and
 * sorts by it natively, which is exactly what we need. The date bound is
 * parameterised (tagged-template interpolation) so Postgres can reuse the
 * query plan and we never interpolate a literal into the SQL string.
 * -------------------------------------------------------------------------
 */

import { db } from "@/lib/db";
import { createTtlCache } from "@/lib/api-helpers";

/** How far back the wall looks. */
const WALL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** How many gems to surface. */
const WALL_LIMIT = 20;

/** How long a cached snapshot is served before re-querying the DB. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — "refreshed daily"

/**
 * The fully-anonymous shape of a single gem on the wall. This is the ONLY
 * shape ever returned to callers — never the underlying ExchangeMessage row.
 */
export interface GemEntry {
  id: string;
  content: string;
  category: string | null;
  language: string;
  created_at: string; // ISO 8601 string
  total_reactions: number;
  hearts: number;
  smiles: number;
  feel_yous: number;
}

interface CachePayload {
  gems: GemEntry[];
  /** epoch-ms when the snapshot was computed. */
  refreshedAt: number;
}

const cache = createTtlCache<CachePayload>(CACHE_TTL_MS);

/**
 * Raw row shape returned by the parameterised SQL query below. `createdAt`
 * may arrive as either a Date or an ISO string depending on the driver
 * (better-sqlite3 typically returns strings for datetime columns), so we
 * coerce it via `new Date(...)` before serialising.
 */
interface RawGemRow {
  id: string;
  content: string;
  category: string | null;
  language: string;
  createdAt: Date | string;
  reactionsHeart: number;
  reactionsSmile: number;
  reactionsFeelYou: number;
  total: number;
}

/**
 * Compute (and cache) the Wall of Gems — the top 20 most-reacted published
 * bottles from the last 7 days, fully anonymised.
 *
 * Returns `{ gems, refreshedAt }` where `refreshedAt` is the epoch-ms at
 * which the returned snapshot was computed. Callers inside the 24h cache
 * window get the cached snapshot; the first caller after expiry triggers a
 * recompute. This is what "refreshed daily" means in practice — no cron,
 * no scheduler, just lazy recompute on the first request after the TTL.
 */
export async function getWallOfGems(): Promise<{
  gems: GemEntry[];
  refreshedAt: number;
}> {
  const cached = cache.get();
  if (cached) {
    return { gems: cached.gems, refreshedAt: cached.refreshedAt };
  }

  const now = Date.now();
  // Cache miss (or expired) — recompute. The date bound is parameterised
  // (tagged-template interpolation) so Postgres can reuse the query plan and
  // we never interpolate a literal into the SQL string. LIMIT is also
  // parameterised; both are safe from injection. The 7-day `since` bound is
  // computed at query time (not module load time) so a long-lived server
  // process always sees a fresh window.
  //
  // Postgres notes: identifiers must be double-quoted because Prisma preserves
  // camelCase via quoted identifiers (unquoted would be lowercased by
  // Postgres). Boolean columns compare against `false`/`true` (not 0/1).
  // DateTime columns are real timestamps, so the bound is passed as a JS Date
  // (Prisma serialises it correctly), not as epoch milliseconds.
  const since = new Date(now - WALL_WINDOW_MS);
  const rows = await db.$queryRaw<RawGemRow[]>`
    SELECT
      "id",
      "content",
      "category",
      "language",
      "createdAt",
      "reactionsHeart",
      "reactionsSmile",
      "reactionsFeelYou",
      ("reactionsHeart" + "reactionsSmile" + "reactionsFeelYou") AS total
    FROM "ExchangeMessage"
    WHERE "source" = 'bottle'
      AND "isHidden" = false
      AND "moderationStatus" = 'published'
      AND "isSeed" = false
      AND "createdAt" >= ${since}
      AND ("reactionsHeart" + "reactionsSmile" + "reactionsFeelYou") >= 1
    ORDER BY total DESC
    LIMIT ${WALL_LIMIT}
  `;

  const gems: GemEntry[] = rows.map((r) => ({
    id: r.id,
    content: r.content,
    category: r.category,
    language: r.language,
    created_at: new Date(r.createdAt).toISOString(),
    // Postgres integer columns come back as numbers via $queryRaw, but some
    // drivers return BigInt for int8 aggregates; coerce to Number (safe —
    // reaction counts are small integers, well within the IEEE-754
    // safe-integer range) so JSON.stringify can always serialise them.
    total_reactions: Number(r.total),
    hearts: Number(r.reactionsHeart),
    smiles: Number(r.reactionsSmile),
    feel_yous: Number(r.reactionsFeelYou),
  }));

  cache.set({ gems, refreshedAt: now });

  return { gems, refreshedAt: now };
}

/** Test-only: clear the in-memory cache so the next call recomputes. */
export function _resetWallOfGemsCacheForTests(): void {
  cache.reset();
}
