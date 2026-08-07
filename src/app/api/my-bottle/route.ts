/**
 * src/app/api/my-bottle/route.ts
 * ---------------------------------------------------------------------------
 * Private "my bottle" reading room. The original author of a bottle, holding
 * the unguessable private token they were handed at publish time, can revisit
 * their own bottle to see the reactions and quick-word replies left by readers
 * — with no login required.
 *
 *   GET /api/my-bottle?token=<privateToken>
 *
 *   - The token is validated for shape, then looked up against
 *     ExchangeMessage.privateToken (a UNIQUE column). Only published, non-
 *     hidden bottles are returnable; a token that points at a moderated-away
 *     bottle yields 404 (the author simply sees "this bottle has drifted
 *     away" — never a moderation reason).
 *   - The response carries: the author's own message (anonymous public
 *     shape) + the three reaction counters + the list of quick-word replies
 *     (id / content / created_at), newest-last.
 *   - Reactions and replies are the ONLY things surfaced here. There is no
 *     author identity, no moderation metadata, no read receipts, and no
 *     notification mechanism. This route is a passive, pull-only view.
 *
 * Security note: possession of the token IS the authorisation. The token is
 * 192 bits of entropy and was returned exactly once at publish time, so the
 * only way to obtain it is to have authored the bottle (or to have been
 * handed the link by the author). We never reveal the token back in any
 * other response (not in the public feed, not in the exchange response to a
 * different reader).
 *
 * `Cache-Control: no-store` is set because the response carries private data
 * (reactions + replies) that must never be cached by a browser or CDN — a
 * shared computer's back-navigation must not surface a stale reading room.
 * ---------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isValidTokenShape } from "@/lib/private-token";
import { noStoreResponse, serverErrorResponse } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPLY_LIST_LIMIT = 200;

interface MyBottle {
  id: string;
  content: string;
  category: string | null;
  language: string;
  created_at: string;
  reveal_count: number;
  reactions_heart: number;
  reactions_smile: number;
  reactions_feel_you: number;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!isValidTokenShape(token)) {
      return noStoreResponse(
        { error: "This bottle link isn't valid or has drifted away." },
        { status: 404 },
      );
    }

    const row = await db.exchangeMessage.findUnique({
      where: { privateToken: token },
      select: {
        id: true,
        content: true,
        category: true,
        language: true,
        createdAt: true,
        revealCount: true,
        reactionsHeart: true,
        reactionsSmile: true,
        reactionsFeelYou: true,
        isHidden: true,
        moderationStatus: true,
        source: true,
      },
    });

    // Token matched nothing, or matched a bottle that is no longer published
    // (moderated away / hidden / not a bottle-source row). In all cases the
    // author sees the same gentle 404 — never a moderation reason.
    if (
      !row ||
      row.source !== "bottle" ||
      row.isHidden ||
      row.moderationStatus !== "published"
    ) {
      return noStoreResponse(
        { error: "This bottle link isn't valid or has drifted away." },
        { status: 404 },
      );
    }

    const bottle: MyBottle = {
      id: row.id,
      content: row.content,
      category: row.category,
      language: row.language,
      created_at: row.createdAt.toISOString(),
      reveal_count: row.revealCount,
      reactions_heart: row.reactionsHeart,
      reactions_smile: row.reactionsSmile,
      reactions_feel_you: row.reactionsFeelYou,
    };

    const replyRows = await db.bottleReply.findMany({
      where: { messageId: row.id },
      orderBy: { createdAt: "asc" },
      take: REPLY_LIST_LIMIT,
      select: { id: true, content: true, createdAt: true },
    });

    const replies = replyRows.map((r) => ({
      id: r.id,
      content: r.content,
      created_at: r.createdAt.toISOString(),
    }));

    return noStoreResponse({ bottle, replies });
  } catch {
    return serverErrorResponse();
  }
}
