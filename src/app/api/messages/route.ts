/**
 * src/app/api/messages/route.ts
 * ---------------------------------------------------------------------------
 * Bottle-app public feed endpoint.
 *
 *   GET /api/messages
 *     Returns ONLY published, non-hidden bottles (source = "bottle"). The
 *     response is anonymous — no authorId, no authorHandle, no moderation
 *     metadata, no private_token. Sorted newest-first.
 *
 * There is intentionally NO POST handler on this route. Bottle creation flows
 * exclusively through POST /api/messages/exchange (the reciprocal-unlock
 * endpoint), which applies the full anti-spam pipeline (rate-limit → captcha
 * → duplicate detection → PII → moderation). A standalone POST here would
 * either duplicate that pipeline (drift risk) or bypass it (security hole).
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  BOTTLE_SELECT,
  toPublicBottle,
  serverErrorResponse,
} from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEED_LIMIT = 50;

// ---------------------------------------------------------------------------
// GET — anonymous feed of published bottles
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const rows = await db.exchangeMessage.findMany({
      where: {
        source: "bottle",
        isHidden: false,
        moderationStatus: "published",
        // Exclude pre-seeded starter bottles (system-generated "AI messages")
        // so the feed only ever shows real, user-authored bottles.
        isSeed: false,
      },
      orderBy: { publishedAt: "desc" },
      take: FEED_LIMIT,
      select: BOTTLE_SELECT,
    });

    const messages = rows.map(toPublicBottle);

    return NextResponse.json({ messages });
  } catch {
    return serverErrorResponse();
  }
}
