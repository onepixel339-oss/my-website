/**
 * src/app/api/turnstile/config/route.ts
 * ---------------------------------------------------------------------------
 *   GET /api/turnstile/config
 *     Returns whether Cloudflare Turnstile is configured and, if so, the
 *     PUBLIC site key (safe to ship to the browser). The secret key is NEVER
 *     exposed — it lives only in the server env and is used by
 *     `verifyTurnstileToken`.
 *
 *     The frontend uses this to decide whether to render the invisible
 *     Turnstile widget on the submit action. When `enabled` is false (no env
 *     configured), no widget renders and the backend bypasses verification —
 *     the app stays fully functional.
 *
 *     Response: { enabled: boolean, siteKey: string | null }
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { getTurnstileSiteKey, isTurnstileEnabled } from "@/lib/turnstile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const siteKey = getTurnstileSiteKey();
  return NextResponse.json(
    { enabled: isTurnstileEnabled(), siteKey },
    {
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
