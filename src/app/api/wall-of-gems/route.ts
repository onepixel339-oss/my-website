/**
 * src/app/api/wall-of-gems/route.ts
 * ---------------------------------------------------------------------------
 *   GET /api/wall-of-gems
 *     Returns the Wall of Gems — the top 20 most-reacted published bottles
 *     from the last 7 days, fully anonymised. Refreshed once every 24h via
 *     an in-process cache (see src/lib/wall-of-gems.ts).
 *
 *     Response:
 *       {
 *         gems: Array<{
 *           id: string,
 *           content: string,
 *           category: string | null,
 *           language: string,
 *           created_at: string,  // ISO 8601
 *           total_reactions: number,
 *           hearts: number,
 *           smiles: number,
 *           feel_yous: number
 *         }>,
 *         refreshed_at: string   // ISO timestamp of the cache's last compute
 *       }
 *
 *     `Cache-Control: no-store` keeps any intermediate/proxy from holding a
 *     stale snapshot; the 24h cache lives in-process on the origin only.
 *     The response is fully anonymous — no authorId, authorHandle,
 *     privateToken, or moderation metadata is ever returned. Same anonymity
 *     contract as GET /api/messages.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { getWallOfGems } from "@/lib/wall-of-gems";
import { serverErrorResponse } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { gems, refreshedAt } = await getWallOfGems();
    return NextResponse.json(
      {
        gems,
        refreshed_at: new Date(refreshedAt).toISOString(),
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
