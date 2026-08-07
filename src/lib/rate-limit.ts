/**
 * src/lib/rate-limit.ts
 * ---------------------------------------------------------------------------
 * Server-side sliding-window rate limiting for the bottle app.
 *
 *   - Bottle throws: 5 per 24 hours per anonymous session hash.
 *   - Reactions:    10 per 1 hour  per anonymous session hash.
 *
 * The spec suggests "Upstash Redis sliding-window OR a Postgres function
 * checking recent rows". This stack is SQLite + Prisma with no Redis, so we
 * use an in-process sliding-window limiter (the canonical in-memory analogue
 * of a Redis sliding window) for the hot path, plus a **DB backstop** for the
 * long 24h throw window so a server restart cannot reset a spammer's daily
 * quota (the DB already records every stored submission with `authorId` =
 * the session hash). The 1h reaction window is in-memory only — it is short
 * enough that a restart reset is inconsequential, and there is no reaction
 * event log table to backstop against.
 *
 * Race safety: the in-memory check+record (`consumeMemory`) is fully
 * SYNCHRONOUS, so it is atomic w.r.t. the Node event loop — two concurrent
 * requests cannot both pass the check before either records. The async DB
 * backstop runs after the atomic memory step and can only ADD restrictions
 * (block more), never relax them, so it introduces no race of its own.
 *
 * Durability caveat: in-memory state is per-process. On a horizontally scaled
 * deployment each instance would enforce its own window; for this app's
 * single-instance threat model (engagement surfaces, not security-critical)
 * that is acceptable. The DB backstop makes the 24h throw quota durable
 * regardless.
 * -------------------------------------------------------------------------
 */

import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Limits & windows
// ---------------------------------------------------------------------------

export const THROW_LIMIT = 5;
export const THROW_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

export const REACTION_LIMIT = 10;
export const REACTION_WINDOW_MS = 60 * 60 * 1000; // 1h

export interface RateLimitResult {
  allowed: boolean;
  /** The ceiling this limiter enforces. */
  limit: number;
  /** How many attempts remain in the window (0 when blocked). */
  remaining: number;
  /** Ms until the oldest event in the window expires (only meaningful when
   *  blocked; 0 when allowed). */
  retryAfterMs: number;
}

// ---------------------------------------------------------------------------
// In-memory sliding-window store
// ---------------------------------------------------------------------------

/** Map<key, sorted-epoch-ms-timestamps>. Timestamps are pushed in order. */
const windows = new Map<string, number[]>();
/** Cap distinct keys so a flood of sessions can't grow it without bound. */
const MAX_KEYS = 20_000;

/**
 * Drop timestamps older than the window for `key`, returning the survivors.
 * Also performs a lazy global sweep when the key count gets large.
 */
function pruneKey(key: string, now: number, windowMs: number): number[] {
  const cutoff = now - windowMs;
  const arr = (windows.get(key) ?? []).filter((t) => t > cutoff);
  if (arr.length === 0) {
    windows.delete(key);
  } else {
    windows.set(key, arr);
  }
  // Lazy global sweep: if the map is huge, drop fully-expired keys.
  if (windows.size > MAX_KEYS) {
    for (const [k, ts] of windows) {
      const live = ts.filter((t) => t > now - THROW_WINDOW_MS);
      if (live.length === 0) windows.delete(k);
      else windows.set(k, live);
    }
  }
  return arr;
}

/**
 * Atomic synchronous check+record for an in-memory sliding window.
 *
 *   - Counts timestamps in the window (peek).
 *   - If count >= limit → BLOCKED (no record added; blocked attempts don't
 *     consume a slot).
 *   - Else → records this attempt now and returns allowed.
 *
 * Because this function is synchronous, it cannot be interleaved with another
 * call by the Node event loop — the check+record is race-free.
 */
function consumeMemory(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  const arr = pruneKey(key, now, windowMs);
  if (arr.length >= limit) {
    const oldest = arr[0] ?? now;
    return {
      allowed: false,
      limit,
      remaining: 0,
      retryAfterMs: Math.max(0, oldest + windowMs - now),
    };
  }
  arr.push(now);
  windows.set(key, arr);
  return {
    allowed: true,
    limit,
    remaining: limit - arr.length,
    retryAfterMs: 0,
  };
}

/** Peek-only count (no record). Used by tests / diagnostics. */
function countInWindow(key: string, windowMs: number, now = Date.now()): number {
  return pruneKey(key, now, windowMs).length;
}

// ---------------------------------------------------------------------------
// Reactions — in-memory only (short 1h window)
// ---------------------------------------------------------------------------

/**
 * Consume a reaction attempt. 10 per hour per session. In-memory only.
 */
export function consumeReactionAttempt(sessionHash: string): RateLimitResult {
  return consumeMemory(
    `react:${sessionHash}`,
    REACTION_LIMIT,
    REACTION_WINDOW_MS,
  );
}

// ---------------------------------------------------------------------------
// Throws — in-memory (atomic) + DB backstop (durable)
// ---------------------------------------------------------------------------

/**
 * Consume a bottle-throw attempt. 5 per 24h per session.
 *
 *   1. Atomic in-memory check+record (race-free).
 *   2. If memory allows, a durable DB backstop: count this session's stored
 *      submissions in the last 24h. If the DB already shows >= 5, block even
 *      though memory allowed (covers the post-restart case where memory was
 *      wiped but the DB remembers). The memory record from step 1 is a
 *      harmless over-record in that case.
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
  const mem = consumeMemory(memKey, THROW_LIMIT, THROW_WINDOW_MS, now);
  if (!mem.allowed) {
    return mem;
  }

  // 2. Durable DB backstop.
  const since = new Date(now - THROW_WINDOW_MS);
  const [dbCount, dbMin] = await Promise.all([
    db.exchangeMessage.count({
      where: { authorId: sessionHash, createdAt: { gte: since } },
    }),
    db.exchangeMessage.aggregate({
      where: { authorId: sessionHash, createdAt: { gte: since } },
      _min: { createdAt: true },
    }),
  ]);

  if (dbCount >= THROW_LIMIT) {
    // Blocked by the durable backstop. Compute retry from the oldest DB row.
    const oldest = dbMin._min.createdAt;
    const retryAfterMs = oldest
      ? Math.max(0, oldest.getTime() + THROW_WINDOW_MS - now)
      : THROW_WINDOW_MS;
    return {
      allowed: false,
      limit: THROW_LIMIT,
      remaining: 0,
      retryAfterMs,
    };
  }

  // Allowed by both gates. Report the tighter remaining of the two.
  return {
    allowed: true,
    limit: THROW_LIMIT,
    remaining: Math.min(mem.remaining, THROW_LIMIT - dbCount - 1),
    retryAfterMs: 0,
  };
}

/**
 * Peek (WITHOUT consuming) how many throw attempts remain for this session.
 *
 * Mirror of `consumeThrowAttempt` minus the record step. Used by the daily
 * quota indicator (GET /api/throw-quota) so the UI can show "2 of 5 bottles
 * left" without spending an attempt.
 *
 * Returns the tighter of the in-memory sliding window and the durable DB
 * backstop (stored submissions in the last 24h). The in-memory window also
 * counts attempts that were later rejected by PII / captcha / duplicate /
 * moderation gates but never stored — so the indicator reflects "attempts
 * consumed", not just "bottles successfully published". After a server
 * restart the in-memory window is wiped and the DB backstop alone carries
 * the durable quota.
 */
export async function peekThrowRemaining(
  sessionHash: string,
): Promise<RateLimitResult> {
  const now = Date.now();
  const memKey = `throw:${sessionHash}`;

  // 1. In-memory peek — prune but do NOT push. arr.length is the count of
  //    attempts still inside the rolling 24h window for this session.
  const arr = pruneKey(memKey, now, THROW_WINDOW_MS);
  if (arr.length >= THROW_LIMIT) {
    const oldest = arr[0] ?? now;
    return {
      allowed: false,
      limit: THROW_LIMIT,
      remaining: 0,
      retryAfterMs: Math.max(0, oldest + THROW_WINDOW_MS - now),
    };
  }
  const memRemaining = THROW_LIMIT - arr.length;

  // 2. Durable DB backstop — count + oldest-stored-row in the last 24h.
  const since = new Date(now - THROW_WINDOW_MS);
  const [dbCount, dbMin] = await Promise.all([
    db.exchangeMessage.count({
      where: { authorId: sessionHash, createdAt: { gte: since } },
    }),
    db.exchangeMessage.aggregate({
      where: { authorId: sessionHash, createdAt: { gte: since } },
      _min: { createdAt: true },
    }),
  ]);

  if (dbCount >= THROW_LIMIT) {
    const oldest = dbMin._min.createdAt;
    const retryAfterMs = oldest
      ? Math.max(0, oldest.getTime() + THROW_WINDOW_MS - now)
      : THROW_WINDOW_MS;
    return {
      allowed: false,
      limit: THROW_LIMIT,
      remaining: 0,
      retryAfterMs,
    };
  }

  // Allowed by both gates. Report the tighter remaining of the two — no
  // "-1" here because this is a peek, not a consume: the next attempt is
  // not yet counted.
  return {
    allowed: true,
    limit: THROW_LIMIT,
    remaining: Math.min(memRemaining, THROW_LIMIT - dbCount),
    retryAfterMs: 0,
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Test-only: clear all in-memory rate-limit state. */
export function _resetRateLimitForTests(): void {
  windows.clear();
}

/** Test-only: peek the in-memory count for a key (no record). */
export function _peekMemoryCount(
  kind: "throw" | "react",
  sessionHash: string,
): number {
  const windowMs = kind === "throw" ? THROW_WINDOW_MS : REACTION_WINDOW_MS;
  return countInWindow(`${kind}:${sessionHash}`, windowMs);
}
