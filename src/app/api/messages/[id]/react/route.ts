/**
 * src/app/api/messages/[id]/react/route.ts
 * ---------------------------------------------------------------------------
 * Lightweight reaction endpoint. A reader who has just had a bottle revealed
 * to them may tap one of three reaction buttons — heart, smile, or
 * "I feel you" — to leave a small, anonymous sign. Each tap increments the
 * matching counter on that message's row.
 *
 *   POST /api/messages/<id>/react
 *     Body: { reaction: "heart" | "smile" | "feel_you" }
 *
 *   - The message must exist and be published (is_hidden=false,
 *     moderation_status="published", source="bottle"). Reacting to a moderated-
 *     away bottle is rejected with 409.
 *   - Per-session throttling (src/lib/reaction-throttle.ts): the same browser
 *     may only fire the SAME reaction on the SAME message once per
 *     REACTION_COOLDOWN_MS. There is NO hard duplicate prevention, so a
 *     session may legitimately react again after the cooldown and the count
 *     will grow. A 429 is returned while cooling down.
 *   - The incremented counter is returned so the client can update its UI
 *     optimistically without a re-fetch.
 *
 * Rate-limit / throttle ordering: both the session-wide rate limit (10/h) and
 * the per-message cooldown (5s) are consumed ONLY after the parent bottle is
 * confirmed to exist and be published. Reacting to a moderated-away or
 * non-existent bottle does NOT burn either slot.
 * ---------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/anonymous-session";
import { checkThrottle, REACTION_COOLDOWN_MS } from "@/lib/reaction-throttle";
import { consumeReactionAttempt } from "@/lib/rate-limit";
import {
  parseJsonBody,
  sanitizeMessageId,
  finalizeResponse,
  serverErrorResponse,
} from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The three supported reaction kinds, in stable order. */
export type ReactionKind = "heart" | "smile" | "feel_you";

const REACTION_FIELDS = {
  heart: "reactionsHeart",
  smile: "reactionsSmile",
  feel_you: "reactionsFeelYou",
} as const satisfies Record<ReactionKind, string>;

function isReactionKind(v: unknown): v is ReactionKind {
  return v === "heart" || v === "smile" || v === "feel_you";
}

interface ReactionCounts {
  heart: number;
  smile: number;
  feel_you: number;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = getSessionFromRequest(req);

  try {
    const { id: rawId } = await params;
    const messageId = sanitizeMessageId(rawId);
    if (!messageId) {
      return finalizeResponse(
        req,
        session,
        NextResponse.json({ error: "Invalid message id." }, { status: 400 }),
      );
    }

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) {
      return finalizeResponse(req, session, parsed.response);
    }

    const fields =
      typeof parsed.data === "object" && parsed.data !== null
        ? (parsed.data as Record<string, unknown>)
        : {};
    const reaction = fields.reaction;
    if (!isReactionKind(reaction)) {
      return finalizeResponse(
        req,
        session,
        NextResponse.json(
          { error: "`reaction` must be one of: heart, smile, feel_you." },
          { status: 400 },
        ),
      );
    }

    // --- verify the parent is a published bottle FIRST ---------------------
    // Doing this before the rate-limit / throttle ensures a reaction to a
    // moderated-away or non-existent bottle does NOT burn either slot.
    const parent = await db.exchangeMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        source: true,
        isHidden: true,
        moderationStatus: true,
        reactionsHeart: true,
        reactionsSmile: true,
        reactionsFeelYou: true,
      },
    });
    if (
      !parent ||
      parent.source !== "bottle" ||
      parent.isHidden ||
      parent.moderationStatus !== "published"
    ) {
      return finalizeResponse(
        req,
        session,
        NextResponse.json(
          { error: "This bottle can no longer be reached." },
          { status: 409 },
        ),
      );
    }

    // --- session-wide rate limit (10 reactions / 1h) -----------------------
    // Consumed only after the parent is confirmed valid. Returns a GENTLE 200
    // (not a raw 429) so the UI can surface the friendly message.
    const reactionLimit = consumeReactionAttempt(session.hash);
    if (!reactionLimit.allowed) {
      return finalizeResponse(
        req,
        session,
        NextResponse.json({
          status: "rate_limited",
          distributed: false,
          limit: reactionLimit.limit,
          retry_after_ms: reactionLimit.retryAfterMs,
          notice:
            "That's a lot of warmth for one hour — let the sea settle a little 🌊",
        }),
      );
    }

    // --- per-message throttle (soft, in-memory) ----------------------------
    // Keyed on session hash + message + the specific reaction, so reacting
    // "heart" does not block reacting "smile" on the same bottle.
    const allowed = checkThrottle(
      session.hash,
      messageId,
      `react:${reaction}`,
      REACTION_COOLDOWN_MS,
    );
    if (!allowed) {
      return finalizeResponse(
        req,
        session,
        NextResponse.json(
          { status: "too_soon", error: "A moment — the sea needs a breath." },
          { status: 429 },
        ),
      );
    }

    // --- increment atomically + return the fresh counts ---------------------
    const field = REACTION_FIELDS[reaction];
    const updated = await db.exchangeMessage.update({
      where: { id: messageId },
      data: { [field]: { increment: 1 } },
      select: {
        reactionsHeart: true,
        reactionsSmile: true,
        reactionsFeelYou: true,
      },
    });

    const counts: ReactionCounts = {
      heart: updated.reactionsHeart,
      smile: updated.reactionsSmile,
      feel_you: updated.reactionsFeelYou,
    };

    return finalizeResponse(
      req,
      session,
      NextResponse.json({ status: "ok", reaction, counts }),
    );
  } catch {
    return finalizeResponse(req, session, serverErrorResponse());
  }
}
