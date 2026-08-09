/**
 * src/lib/rate-limit.ts
 * ---------------------------------------------------------------------------
 * Server-side TOKEN-BUCKET (rolling) rate limiting for the bottle app.
 *
 *   - Bottle throws:  capacity 10, 1 token refills every 30 minutes.
 *   - Reactions:      10 per 1 hour per anonymous session hash (in-memory
 *                     fixed window — short, not worth a bucket).
 *
 * Rolling / token-bucket semantics (what the user asked for):
 *
 *   - The bucket holds at most 10 tokens (= 10 bottles).
 *   - Every 30 minutes, 1 token drips back into the bucket.
 *   - Throwing a bottle consumes 1 token.
 *   - If you throw all 10 at once, you get the 1st back after 30 min, the
 *     2nd after 60 min, … the 10th (full) after 5 hours.
 *   - If you throw slowly (one every 30+ min) you effectively never run out.
 *
 * This is NOT a fixed window (where all 10 refill at once). Each bottle
 * regenerates on its own drip schedule, so the refill is gradual.
 *
 * Implementation:
 *   - In-memory: per-key { tokens, lastRefill }. tokens is a FLOAT so
 *     fractional regeneration accumulates between calls. The check+record
 *     is fully SYNCHRONOUS → race-free w.r.t. the Node event loop.
 *   - DB backstop (throws only): reconstructs the token count by SIMULATING
 *     the bucket over this session's stored submissions in the last 5h.
 *     This survives server restarts (when the in-memory bucket is wiped).
 *
 * Race safety: the in-memory check+record is synchronous, so two concurrent
 * requests cannot both pass before either records.
 *
 * Durability caveat: in-memory state is per-process. The DB backstop makes
 * the throw quota durable regardless of restarts.
 * -------------------------------------------------------------------------
 */

import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Limits & windows
// ---------------------------------------------------------------------------

/** Maximum bottles a session can hold at once. */
export const THROW_LIMIT = 10;
/** Time to regenerate ONE bottle (30 minutes). */
export const REFILL_INTERVAL_MS = 30 * 60 * 1000; // 30 min
/**
 * Total window = capacity × interval = 5h. Used by the DB backstop to decide
 * how far back to look for stored submissions. A submission older than this
 * can no longer affect the token count (its slot has fully regenerated).
 */
export const THROW_WINDOW_MS = THROW_LIMIT * REFILL_INTERVAL_MS; // 5h

export const REACTION_LIMIT = 10;
export const REACTION_WINDOW_MS = 60 * 60 * 1000; // 1h

export interface RateLimitResult {
  allowed: boolean;
  /** The ceiling this limiter enforces. */
  limit: number;
  /** How many whole bottles remain (0 when blocked). */
  remaining: number;
  /** Ms until the next bottle refills (only meaningful when blocked; 0
   *  when allowed). */
  retryAfterMs: number;
}

// ---------------------------------------------------------------------------
// In-memory token-bucket store
// ---------------------------------------------------------------------------

/** Per-key token bucket: current (fractional) token count + last drip time. */
interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

/** Map<key, TokenBucket>. */
const buckets = new Map<string, TokenBucket>();
/** Cap distinct keys so a flood of sessions can't grow it without bound. */
const MAX_KEYS = 20_000;

/**
 * Lazy global sweep: drop entries whose bucket is full (nothing useful to
 * remember — a fresh bucket would start full anyway). Called inline when
 * the map gets large.
 */
function maybeSweep(now: number): void {
  if (buckets.size <= MAX_KEYS) return;
  for (const [k, entry] of buckets) {
    // If the bucket would be completely full by now, forget it.
    const fullAt = entry.lastRefill + (THROW_LIMIT - entry.tokens) * REFILL_INTERVAL_MS;
    if (fullAt <= now) {
      buckets.delete(k);
    }
  }
}

/**
 * Regenerate tokens based on elapsed time, capping at the limit.
 * Mutates the bucket in place and returns it.
 */
function refill(bucket: TokenBucket, limit: number, intervalMs: number, now: number): TokenBucket {
  if (bucket.tokens >= limit) {
    bucket.lastRefill = now;
    return bucket;
  }
  const elapsed = now - bucket.lastRefill;
  if (elapsed > 0) {
    const dripped = elapsed / intervalMs;
    bucket.tokens = Math.min(limit, bucket.tokens + dripped);
    bucket.lastRefill = now;
  }
  return bucket;
}

/**
 * Atomic synchronous check+record for an in-memory token bucket.
 *
 *   - If no bucket exists → start full (tokens = limit) and regenerate is
 *     a no-op. Consume 1 if limit >= 1.
 *   - Regenerate based on elapsed time since lastRefill.
 *   - If tokens >= 1 → consume 1, ALLOW, remaining = floor(tokens).
 *   - Else → BLOCK, remaining = 0, retryAfterMs = ceil((1 - tokens) * interval).
 *
 * Because this function is synchronous, it cannot be interleaved with another
 * call by the Node event loop — the check+record is race-free.
 */
function consumeMemory(
  key: string,
  limit: number,
  intervalMs: number,
  now = Date.now(),
): RateLimitResult {
  maybeSweep(now);
  let entry = buckets.get(key);

  if (!entry) {
    entry = { tokens: limit, lastRefill: now };
    buckets.set(key, entry);
  } else {
    refill(entry, limit, intervalMs, now);
  }

  if (entry.tokens >= 1) {
    entry.tokens -= 1;
    const remaining = Math.floor(entry.tokens);
    return {
      allowed: true,
      limit,
      remaining,
      retryAfterMs: 0,
    };
  }

  // Blocked — time until the next whole bottle.
  const retryAfterMs = Math.ceil((1 - entry.tokens) * intervalMs);
  return {
    allowed: false,
    limit,
    remaining: 0,
    retryAfterMs,
  };
}

/**
 * Peek (WITHOUT consuming) the remaining bottles for a key.
 * Used by the quota indicator so the UI can show "7 of 10 left" without
 * spending a bottle. Also reports when the next bottle drips in.
 */
function peekMemory(
  key: string,
  limit: number,
  intervalMs: number,
  now = Date.now(),
): RateLimitResult {
  const entry = buckets.get(key);

  if (!entry) {
    // No bucket → full quota, no pending drip.
    return { allowed: true, limit, remaining: limit, retryAfterMs: 0 };
  }

  refill(entry, limit, intervalMs, now);

  const remaining = Math.floor(entry.tokens);
  if (remaining >= 1) {
    return { allowed: true, limit, remaining, retryAfterMs: 0 };
  }

  // Empty but a fraction is regenerating — report when the next whole bottle
  // arrives.
  const retryAfterMs = Math.ceil((1 - entry.tokens) * intervalMs);
  return {
    allowed: false,
    limit,
    remaining: 0,
    retryAfterMs,
  };
}

// ---------------------------------------------------------------------------
// Reactions — in-memory only (short 1h fixed window)
// ---------------------------------------------------------------------------

/**
 * Consume a reaction attempt. 10 per hour per session. In-memory only.
 * Uses a simple fixed window — reactions are low-stakes and short-lived.
 */
export function consumeReactionAttempt(sessionHash: string): RateLimitResult {
  return consumeReactionFixedWindow(`react:${sessionHash}`);
}

// Tiny fixed-window helper reused for reactions (kept inline to avoid
// confusing it with the token-bucket throw limiter).
const reactionWindows = new Map<string, { windowStart: number; count: number }>();
function consumeReactionFixedWindow(key: string): RateLimitResult {
  const now = Date.now();
  const entry = reactionWindows.get(key);
  if (!entry || now - entry.windowStart >= REACTION_WINDOW_MS) {
    reactionWindows.set(key, { windowStart: now, count: 1 });
    return { allowed: true, limit: REACTION_LIMIT, remaining: REACTION_LIMIT - 1, retryAfterMs: 0 };
  }
  if (entry.count >= REACTION_LIMIT) {
    return {
      allowed: false,
      limit: REACTION_LIMIT,
      remaining: 0,
      retryAfterMs: Math.max(0, entry.windowStart + REACTION_WINDOW_MS - now),
    };
  }
  entry.count++;
  return { allowed: true, limit: REACTION_LIMIT, remaining: REACTION_LIMIT - entry.count, retryAfterMs: 0 };
}

// ---------------------------------------------------------------------------
// Throws — in-memory (atomic) + DB backstop (durable)
// ---------------------------------------------------------------------------

/**
 * Reconstruct the token-bucket state from this session's stored submissions.
 *
 * We fetch every ExchangeMessage this session created in the last 5h (= the
 * full window; older rows can't affect the count) and replay them through a
 * simulated token bucket starting full. The result is the durable token
 * count that survives server restarts.
 *
 *   - Start: tokens = THROW_LIMIT, clock = oldest submission time.
 *   - For each submission: regenerate from clock→t, then consume 1.
 *   - After all submissions: regenerate from last→now.
 *   - Return { tokens (float), retryAfterMs }.
 *
 * PII-rejected submissions are never stored, so they don't appear here —
 * but the in-memory bucket DOES count them (it runs before the PII gate).
 * So effective coverage = max(memory[all attempts], DB[stored attempts]).
 */
async function dbTokenBucketState(
  sessionHash: string,
  now: number,
): Promise<{ tokens: number; retryAfterMs: number }> {
  const since = new Date(now - THROW_WINDOW_MS);
  const submissions = await db.exchangeMessage.findMany({
    where: { authorId: sessionHash, createdAt: { gte: since } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  if (submissions.length === 0) {
    return { tokens: THROW_LIMIT, retryAfterMs: 0 };
  }

  // Simulate the bucket from the oldest submission forward.
  let tokens = THROW_LIMIT;
  let clock = submissions[0].createdAt.getTime();

  for (const sub of submissions) {
    const t = sub.createdAt.getTime();
    if (t > clock) {
      const elapsed = t - clock;
      tokens = Math.min(THROW_LIMIT, tokens + elapsed / REFILL_INTERVAL_MS);
      clock = t;
    }
    tokens -= 1; // consume
    if (tokens < 0) tokens = 0; // safety clamp (shouldn't happen in normal flow)
  }

  // Regenerate to "now".
  if (now > clock) {
    tokens = Math.min(THROW_LIMIT, tokens + (now - clock) / REFILL_INTERVAL_MS);
  }

  const retryAfterMs = tokens >= 1 ? 0 : Math.ceil((1 - tokens) * REFILL_INTERVAL_MS);
  return { tokens, retryAfterMs };
}

/**
 * Consume a bottle-throw attempt. Token-bucket: 10 capacity, 1 refill / 30min.
 *
 *   1. Atomic in-memory check+record (race-free).
 *   2. If memory allows, a durable DB backstop: reconstruct the bucket from
 *      stored submissions. If the DB says < 1 token, block until the next
 *      drip (covers the post-restart case where memory was wiped but the DB
 *      remembers).
 *
 * Note: PII-rejected submissions are never stored, so the DB backstop cannot
 * see them — but the in-memory step does (it runs before PII). So effective
 * coverage = max(memory[all attempts], DB[stored attempts]).
 */
export async function consumeThrowAttempt(
  sessionHash: string,
): Promise<RateLimitResult> {
  const now = Date.now();
  const memKey = `throw:${sessionHash}`;

  // 1. Atomic memory check+record.
  const mem = consumeMemory(memKey, THROW_LIMIT, REFILL_INTERVAL_MS, now);
  if (!mem.allowed) {
    return mem;
  }

  // 2. Durable DB backstop — reconstruct the bucket from stored submissions.
  const dbState = await dbTokenBucketState(sessionHash, now);
  if (dbState.tokens < 1) {
    // DB is tighter than memory (e.g. after a restart). Block until the next
    // drip. Note: memory already consumed 1 — this is a conservative
    // over-count, acceptable because the DB is the authoritative gate here.
    return {
      allowed: false,
      limit: THROW_LIMIT,
      remaining: 0,
      retryAfterMs: dbState.retryAfterMs,
    };
  }

  // Allowed by both gates. Report the tighter remaining of the two.
  // DB tokens reflect state BEFORE this attempt (the row isn't stored yet),
  // so subtract 1 from the DB view to account for the consume we just did.
  const dbRemainingAfterConsume = Math.max(0, Math.floor(dbState.tokens) - 1);
  return {
    allowed: true,
    limit: THROW_LIMIT,
    remaining: Math.min(mem.remaining, dbRemainingAfterConsume),
    retryAfterMs: 0,
  };
}

/**
 * Peek (WITHOUT consuming) how many throw attempts remain for this session.
 *
 * Mirror of `consumeThrowAttempt` minus the record step. Used by the quota
 * indicator (GET /api/throw-quota) so the UI can show "7 of 10 bottles left"
 * without spending an attempt.
 *
 * Returns the tighter of the in-memory bucket and the durable DB backstop.
 * The in-memory bucket also counts attempts that were later rejected by PII /
 * captcha / duplicate / moderation gates but never stored — so the indicator
 * reflects "attempts consumed", not just "bottles successfully published".
 * After a server restart the in-memory bucket is wiped and the DB backstop
 * alone carries the durable quota.
 */
export async function peekThrowRemaining(
  sessionHash: string,
): Promise<RateLimitResult> {
  const now = Date.now();
  const memKey = `throw:${sessionHash}`;

  // 1. In-memory peek.
  const mem = peekMemory(memKey, THROW_LIMIT, REFILL_INTERVAL_MS, now);

  // 2. Durable DB backstop — reconstruct the bucket from stored submissions.
  const dbState = await dbTokenBucketState(sessionHash, now);

  const dbRemaining = Math.floor(dbState.tokens);
  const remaining = Math.min(mem.remaining, dbRemaining);

  // When blocked, report the LONGER of the two retry windows (the user has to
  // wait for whichever gate is stricter to clear — but in practice after a
  // restart the DB is stricter, and during normal operation both agree).
  const retryAfterMs =
    remaining >= 1
      ? 0
      : Math.max(mem.retryAfterMs, dbState.retryAfterMs);

  return {
    allowed: remaining >= 1,
    limit: THROW_LIMIT,
    remaining,
    retryAfterMs,
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Test-only: clear all in-memory rate-limit state. */
export function _resetRateLimitForTests(): void {
  buckets.clear();
  reactionWindows.clear();
}

/** Test-only: peek the in-memory token count for a key (no record). */
export function _peekMemoryCount(
  kind: "throw" | "react",
  sessionHash: string,
): number {
  if (kind === "react") {
    const entry = reactionWindows.get(`react:${sessionHash}`);
    if (!entry) return 0;
    if (Date.now() - entry.windowStart >= REACTION_WINDOW_MS) return 0;
    return entry.count;
  }
  const entry = buckets.get(`throw:${sessionHash}`);
  if (!entry) return 0;
  // Reflect regenerated state.
  const now = Date.now();
  const regenerated = Math.min(
    THROW_LIMIT,
    entry.tokens + (now - entry.lastRefill) / REFILL_INTERVAL_MS,
  );
  return Math.floor(regenerated);
}
