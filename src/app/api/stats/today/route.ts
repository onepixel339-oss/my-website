/**
 * src/app/api/stats/today/route.ts
 * ---------------------------------------------------------------------------
 *   GET /api/stats/today
 *     Returns the number of bottles exchanged (published) since the start of
 *     the audience's local day (midnight Africa/Cairo, DST-correct).
 *
 *     Response:
 *       { count: number, asOf: string (ISO), since: string (ISO) }
 *
 *     The count is coalesced behind a 3s in-process cache (see
 *     src/lib/exchange-stats.ts) so the header's 15s poll doesn't hammer the
 *     DB. `Cache-Control: no-store` keeps any intermediate/proxy from holding
 *     a stale number, since the value is expected to change frequently.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { getTodaysExchangeCount } from "@/lib/exchange-stats";
import { serverErrorResponse } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { count, asOf, since } = await getTodaysExchangeCount();
    return NextResponse.json(
      {
        count,
        asOf: new Date(asOf).toISOString(),
        since: since.toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch {
    return serverErrorResponse();
  }
}
