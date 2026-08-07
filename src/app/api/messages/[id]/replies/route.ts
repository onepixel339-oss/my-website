/**
 * src/app/api/messages/[id]/replies/route.ts
 * ---------------------------------------------------------------------------
 * Quick-word reply endpoint. A reader whose bottle has just been revealed may
 * leave ONE short (<=30 char) anonymous word. The reply is appended to the
 * message's `bottleReplies` and is visible ONLY to the original author, via
 * their private token link (GET /api/my-bottle). There is no chat thread and
 * no ongoing conversation — each reply is a one-shot note.
 *
 *   POST /api/messages/<id>/replies
 *     Body: { content: string }
 *
 *   - The SAME PII filter that guards messages runs here BEFORE the INSERT
 *     (src/lib/pii-filter.ts). Rejection never stores the reply and returns
 *     the notice + findings for inline highlighting.
 *   - content must be 1..30 chars (after trim).
 *   - The parent message must be a published bottle.
 *   - Per-session throttling: one reply per session per message per
 *     REPLY_COOLDOWN_MS. No hard duplicate prevention beyond that.
 *   - The reply carries NO author identity (fully anonymous). The poster does
 *     not receive the list of replies (private to the author).
 *
 * Throttle ordering: the throttle slot is consumed ONLY on the happy path
 * (after content validation, PII, and parent-existence checks all pass). A
 * PII-laden reply or a reply to a moderated-away bottle does NOT burn the
 * cooldown slot — those are user / edge-case errors, not spam.
 * ---------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { filterMessage } from "@/lib/pii-filter";
import { getSessionFromRequest } from "@/lib/anonymous-session";
import { checkThrottle, REPLY_COOLDOWN_MS } from "@/lib/reaction-throttle";
import {
  parseJsonBody,
  getStringField,
  sanitizeMessageId,
  finalizeResponse,
  serverErrorResponse,
} from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REPLY = 30;

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

    const content = getStringField(parsed.data, "content").trim();
    if (!content) {
      return finalizeResponse(
        req,
        session,
        NextResponse.json(
          { status: "invalid", error: "Write a word first." },
          { status: 400 },
        ),
      );
    }
    if (content.length > MAX_REPLY) {
      return finalizeResponse(
        req,
        session,
        NextResponse.json(
          { status: "invalid", error: `Keep it to ${MAX_REPLY} characters.` },
          { status: 400 },
        ),
      );
    }

    // === PII GATE (same filter as messages, before INSERT) ==================
    const pii = filterMessage(content);
    if (!pii.ok) {
      return finalizeResponse(
        req,
        session,
        NextResponse.json({
          status: "pii_rejected",
          distributed: false,
          notice: pii.rejection.notice,
          findings: pii.rejection.findings,
        }),
      );
    }

    // --- verify the parent is a published bottle ----------------------------
    const parent = await db.exchangeMessage.findUnique({
      where: { id: messageId },
      select: { id: true, source: true, isHidden: true, moderationStatus: true },
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

    // --- per-session throttle (one reply per session per message per window)
    // Consumed ONLY on the happy path — after validation, PII, and parent
    // checks all pass. A failed validation or PII rejection does NOT lock the
    // user out of replying for the cooldown window.
    const allowed = checkThrottle(
      session.hash,
      messageId,
      "reply",
      REPLY_COOLDOWN_MS,
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

    // --- insert the anonymous reply -----------------------------------------
    await db.bottleReply.create({
      data: { messageId, content },
      select: { id: true },
    });

    return finalizeResponse(
      req,
      session,
      NextResponse.json({ status: "published", distributed: true }),
    );
  } catch {
    return finalizeResponse(req, session, serverErrorResponse());
  }
}
