/**
 * src/lib/exchange-stats.ts
 * ---------------------------------------------------------------------------
 * "Bottles exchanged today" — the count of published bottles created since
 * the start of the audience's local day (midnight Africa/Cairo, DST-correct).
 *
 * Each successful exchange (POST /api/messages/exchange with a moderation
 * "publish" decision) stores exactly one published bottle, so counting
 * published bottles created today == counting exchanges made today.
 *
 * The header polls this number every 15s (see <LiveBottleCounter />). With
 * many concurrent clients that would mean one COUNT(*) per poll per client —
 * acceptable on SQLite but wasteful since the underlying set changes at most
 * a few times per second. We coalesce those reads behind a tiny in-process
 * TTL cache (default 3s): every client within the same 3s window shares one
 * DB hit. The 3s window is short enough that the counter still feels live,
 * and across a midnight boundary the cache expires within 3s and recomputes
 * against the new start-of-day, so the counter resets promptly at local
 * midnight without needing a dedicated cron.
 * -------------------------------------------------------------------------
 */

import { db } from "@/lib/db";
import { startOfTodayInZone } from "@/lib/timezone";
import { createTtlCache } from "@/lib/api-helpers";

/** The audience timezone for "today". Cairo = the project's primary audience. */
export const EXCHANGE_TODAY_TZ = "Africa/Cairo";

/** How long a cached count is served before re-querying the DB. */
const CACHE_TTL_MS = 3_000;

interface CachePayload {
  count: number;
  /** epoch ms when the value was computed. */
  asOf: number;
  /** The start-of-day instant used for this count (for the `since` field). */
  since: Date;
}

const cache = createTtlCache<CachePayload>(CACHE_TTL_MS);

/**
 * Count of published bottles created since the start of today in
 * Africa/Cairo. Cached for `CACHE_TTL_MS`.
 */
export async function getTodaysExchangeCount(): Promise<{
  count: number;
  asOf: number;
  since: Date;
}> {
  const cached = cache.get();
  if (cached) {
    return { count: cached.count, asOf: cached.asOf, since: cached.since };
  }

  const now = Date.now();
  const since = startOfTodayInZone(EXCHANGE_TODAY_TZ, new Date(now));

  // Published bottles (source = "bottle") created today. `createdAt` is
  // indexed (@@index([createdAt])) and, for published rows, is within
  // milliseconds of `publishedAt` (both set in the same transaction), so we
  // use the indexed column for a fast range scan.
  const count = await db.exchangeMessage.count({
    where: {
      source: "bottle",
      isHidden: false,
      moderationStatus: "published",
      createdAt: { gte: since },
    },
  });

  const payload: CachePayload = { count, asOf: now, since };
  cache.set(payload);
  return payload;
}

/** Test-only: clear the in-memory cache. */
export function _resetExchangeStatsCacheForTests(): void {
  cache.reset();
}
