/**
 * src/app/api/throw-quota/route.ts
 * ---------------------------------------------------------------------------
 *   GET /api/throw-quota
 *     Returns how many bottle throws the current anonymous session has left
 *     in the rolling 24h window, so the UI can render a friendly
 *     "2 of 5 bottles left" indicator beside the composer.
 *
 *     Response:
 *       {
 *         limit:          5,
 *         used:           number,   // limit - remaining (attempts consumed)
 *         remaining:      number,   // >= 0
 *         window_ms:      86400000,
 *         retry_after_ms: number    // 0 when remaining > 0
 *       }
 *
 *     The peek is NON-CONSUMING: calling this endpoint does NOT spend an
 *     attempt. It returns the TIGHTER of two views:
 *       1. The in-memory sliding window (`rate-limit.ts`) — counts every
 *          attempt in the last 24h, INCLUDING ones later rejected by PII /
 *          captcha / duplicate / moderation gates and never stored. So the
 *          indicator reflects "attempts consumed" rather than only "bottles
 *          successfully published".
 *       2. The durable DB backstop — a COUNT of this session's stored
 *          ExchangeMessage rows with createdAt >= now - 24h. This survives
 *          server restarts (when the in-memory window is wiped), so the
 *          quota stays durable even after a deploy.
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
  THROW_WINDOW_MS,
} from "@/lib/rate-limit";
import { finalizeResponse, serverErrorResponse } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);

  try {
    // Non-consuming peek — does NOT push to the in-memory window and does NOT
    // insert into the DB. Returns the tighter of (in-memory remaining,
    // DB-backstop remaining).
    const result = await peekThrowRemaining(session.hash);

    const res = NextResponse.json(
      {
        limit: result.limit,
        used: Math.max(0, result.limit - result.remaining),
        remaining: result.remaining,
        window_ms: THROW_WINDOW_MS,
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
