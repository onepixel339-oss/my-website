/**
 * src/app/api/throw-quota/route.ts
 * ---------------------------------------------------------------------------
 *   GET /api/throw-quota
 *     Returns how many bottle throws the current anonymous session has left,
 *     using a ROLLING token-bucket model (capacity 10, 1 refill / 30 min),
 *     so the UI can render a friendly "2 of 10 bottles left" indicator beside
 *     the composer — plus a "next bottle in ~N min" hint.
 *
 *     Response:
 *       {
 *         limit:             10,
 *         used:              number,   // limit - remaining (attempts consumed)
 *         remaining:         number,   // >= 0 (whole bottles available now)
 *         refill_interval_ms:1800000,  // 30 min — time per bottle
 *         next_refill_ms:    number,   // ms until the next bottle drips in
 *                                      //   (0 when at full capacity)
 *         retry_after_ms:    number    // 0 when remaining > 0; otherwise
 *                                      //   same as next_refill_ms
 *       }
 *
 *     The peek is NON-CONSUMING: calling this endpoint does NOT spend an
 *     attempt. It returns the TIGHTER of two views:
 *       1. The in-memory token bucket (`rate-limit.ts`) — counts every
 *          attempt in the last 5h, INCLUDING ones later rejected by PII /
 *          captcha / duplicate / moderation gates and never stored. So the
 *          indicator reflects "attempts consumed" rather than only "bottles
 *          successfully published".
 *       2. The durable DB backstop — reconstructs the bucket by SIMULATING
 *          over this session's stored ExchangeMessage rows with createdAt
 *          >= now - 5h. This survives server restarts (when the in-memory
 *          bucket is wiped), so the quota stays durable even after a deploy.
 *
 *     A first-time visitor (no `bottle_session` cookie) gets a freshly
 *     generated session token set on the response — identical to the
 *     exchange endpoint's `finalize()` helper — so the next call carries a
 *     stable identity. Without this, the indicator would briefly show a
 *     different session's quota on every call until the user submitted their
 *     first bottle and triggered cookie-set on the exchange response.
 *
 *     `Cache-Control: no-store` because the value is per-session and
 *     changes on every successful throw.
 * ---------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/anonymous-session";
import {
  peekThrowRemaining,
  REFILL_INTERVAL_MS,
  THROW_LIMIT,
} from "@/lib/rate-limit";
import { finalizeResponse, serverErrorResponse } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);

  try {
    // Non-consuming peek — does NOT push to the in-memory bucket and does NOT
    // insert into the DB. Returns the tighter of (in-memory remaining,
    // DB-backstop remaining).
    const result = await peekThrowRemaining(session.hash);

    // When the user has bottles left but is below full capacity, the next
    // bottle drips in `next_refill_ms`. When blocked (remaining === 0),
    // next_refill_ms === retry_after_ms.
    const nextRefillMs =
      result.remaining >= THROW_LIMIT
        ? 0
        : result.retryAfterMs > 0
          ? result.retryAfterMs
          : REFILL_INTERVAL_MS; // at a whole-number boundary; next drip ~30min away

    const res = NextResponse.json(
      {
        limit: result.limit,
        used: Math.max(0, result.limit - result.remaining),
        remaining: result.remaining,
        refill_interval_ms: REFILL_INTERVAL_MS,
        next_refill_ms: nextRefillMs,
        retry_after_ms: result.retryAfterMs,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );

    // Persist the session cookie for a first-time visitor so subsequent calls
    // (and the eventual POST to /api/messages/exchange) carry a stable identity.
    return finalizeResponse(req, session, res);
  } catch {
    return finalizeResponse(req, session, serverErrorResponse());
  }
}
