/**
 * src/app/api/admin/review/[id]/route.ts
 * ---------------------------------------------------------------------------
 * Moderator action on a single flagged message.
 *
 *   POST /api/admin/review/[id]
 *     Body: { action: "approve" | "reject" | "resolve", note?: string }
 *
 *   - approve  : publish a pending_review message (is_hidden = false,
 *                status = published, publishedAt = now). The human overrides
 *                the borderline classification.
 *   - reject   : keep a pending_review / self_harm_blocked message hidden and
 *                mark it rejected.
 *   - resolve  : acknowledge a self_harm / rejected case without changing
 *                distribution (the author already received the appropriate
 *                response). Sets adminResolvedAt + optional note.
 *
 * Every action also writes a new ModerationLog row so the audit trail records
 * the human decision (decision = "human_approve" | "human_reject" |
 * "human_resolve", flagType = original flag, confidence = 1.0 to denote a
 * human override). No trigger words are ever stored.
 *
 * Authorisation: when the `ADMIN_SECRET_TOKEN` env var is set, the request
 * must carry it in the `x-admin-token` header or `admin_token` cookie.
 * ---------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  requireAdmin,
  sanitizeMessageId,
  noStoreResponse,
  serverErrorResponse,
} from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminAction = "approve" | "reject" | "resolve";

const ALLOWED_ACTIONS: ReadonlySet<AdminAction> = new Set([
  "approve",
  "reject",
  "resolve",
]);

/** Type guard: narrow an unknown value to AdminAction. */
function isAdminAction(v: unknown): v is AdminAction {
  return typeof v === "string" && ALLOWED_ACTIONS.has(v as AdminAction);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  // Optional shared-secret admin gate.
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { id: rawId } = await ctx.params;
    const messageId = sanitizeMessageId(rawId);
    if (!messageId) {
      return NextResponse.json(
        { error: "Invalid message id." },
        { status: 400 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    // Safely extract `action` and `note` from the parsed body without an
    // unsound `as Record<string, unknown>` cast on a possibly-null body.
    const fields =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>)
        : {};
    const action = isAdminAction(fields.action) ? fields.action : null;
    const note =
      typeof fields.note === "string" ? fields.note.trim().slice(0, 500) : null;

    if (!action) {
      return NextResponse.json(
        { error: "action must be one of: approve, reject, resolve." },
        { status: 400 },
      );
    }

    const existing = await db.exchangeMessage.findUnique({
      where: { id: messageId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Message not found." },
        { status: 404 },
      );
    }

    const now = new Date();

    if (action === "approve") {
      // Only pending_review items can be approved into distribution.
      if (existing.moderationStatus !== "pending_review") {
        return NextResponse.json(
          { error: "Only messages awaiting review can be approved." },
          { status: 409 },
        );
      }
      const updated = await db.$transaction(async (tx) => {
        const m = await tx.exchangeMessage.update({
          where: { id: messageId },
          data: {
            moderationStatus: "published",
            isHidden: false,
            publishedAt: now,
            adminResolvedAt: now,
            adminNote: note,
          },
        });
        await tx.moderationLog.create({
          data: {
            messageId,
            flagType: existing.moderationFlagType ?? "none",
            confidence: 1,
            decision: "human_approve",
            modelVersion: "human-review",
          },
        });
        return m;
      });
      return noStoreResponse({ ok: true, status: "published", message: updated });
    }

    if (action === "reject") {
      if (existing.moderationStatus === "published") {
        return NextResponse.json(
          {
            error: "Cannot reject an already-published message via this action.",
          },
          { status: 409 },
        );
      }
      const updated = await db.$transaction(async (tx) => {
        const m = await tx.exchangeMessage.update({
          where: { id: messageId },
          data: {
            moderationStatus: "rejected",
            isHidden: true,
            adminResolvedAt: now,
            adminNote: note,
          },
        });
        await tx.moderationLog.create({
          data: {
            messageId,
            flagType: existing.moderationFlagType ?? "none",
            confidence: 1,
            decision: "human_reject",
            modelVersion: "human-review",
          },
        });
        return m;
      });
      return noStoreResponse({ ok: true, status: "rejected", message: updated });
    }

    // action === "resolve"
    const updated = await db.$transaction(async (tx) => {
      const m = await tx.exchangeMessage.update({
        where: { id: messageId },
        data: {
          adminResolvedAt: now,
          adminNote: note,
        },
      });
      await tx.moderationLog.create({
        data: {
          messageId,
          flagType: existing.moderationFlagType ?? "none",
          confidence: 1,
          decision: "human_resolve",
          modelVersion: "human-review",
        },
      });
      return m;
    });

    return noStoreResponse({ ok: true, status: "resolved", message: updated });
  } catch {
    return serverErrorResponse();
  }
}
