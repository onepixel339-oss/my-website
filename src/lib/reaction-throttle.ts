/**
 * src/lib/reaction-throttle.ts
 * ---------------------------------------------------------------------------
 * Basic per-session throttling for bottle reactions and quick-word replies.
 *
 * Spec: "no duplicate prevention needed beyond basic per-session throttling".
 * So we do NOT hard-block a session from ever reacting twice to the same
 * message (that would be duplicate prevention). Instead we rate-limit: a
 * given session may only fire the SAME action (react heart / react smile /
 * react feel-you / post reply) on the SAME message at most once per cooldown
 * window. Spam-tapping the heart button within 5 seconds is rejected; coming
 * back a minute later to react again is allowed (the count simply grows).
 *
 * Implementation: an in-process Map<string, number> mapping a composite key
 * to the epoch-ms when the cooldown expires. This is deliberately NOT a DB
 * record — it is a soft, ephemeral, best-effort gate that resets on server
 * restart. It exists purely to keep a single bad actor from inflating a
 * counter by holding F5 / curl-looping; it is not a correctness guarantee.
 *
 * Because Next.js route handlers run in the same Node process as the rest of
 * the server, module-level state is shared across requests. On a horizontally
 * scaled deployment this would only throttle per-instance — acceptable for
 * this app's threat model (the counters are engagement candy, not security).
 * ---------------------------------------------------------------------------
 */

// Cooldowns. Tuned to feel responsive to a genuine user while deflating a
// tight loop. Reactions: 5s (a human won't meaningfully re-react faster).
// Replies: 10s (writing a 1–30 char word takes at least that long).
export const REACTION_COOLDOWN_MS = 5_000;
export const REPLY_COOLDOWN_MS = 10_000;

// Cap the map so a flood of distinct keys can't grow it without bound. When
// exceeded, oldest entries are evicted lazily during the periodic sweep.
const MAX_ENTRIES = 20_000;

const store = new Map<string, number>();

/**
 * Check + record an action under throttling. Returns `true` when the action
 * is allowed (and records the new cooldown), `false` when the session is
 * still within the cooldown window for that exact action+message.
 *
 * @param sessionHash sha256(session cookie) — the per-browser identity.
 * @param messageId    The bottle the action targets.
 * @param action       A stable action discriminator, e.g. "react:heart" or "reply".
 * @param cooldownMs   How long the session must wait before repeating.
 */
export function checkThrottle(
  sessionHash: string,
  messageId: string,
  action: string,
  cooldownMs: number,
): boolean {
  const key = `${sessionHash}:${messageId}:${action}`;
  const now = Date.now();

  // Lazy sweep: if the map has grown large, drop expired entries before
  // deciding. Keeps memory bounded without a dedicated timer.
  if (store.size > MAX_ENTRIES) {
    for (const [k, expiry] of store) {
      if (expiry <= now) store.delete(k);
    }
  }

  const expiry = store.get(key);
  if (expiry !== undefined && expiry > now) {
    return false; // still cooling down
  }
  store.set(key, now + cooldownMs);
  return true;
}

/** Test-only escape hatch. Not used in app code. */
export function _resetThrottleForTests(): void {
  store.clear();
}
