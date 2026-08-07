/**
 * src/app/api/admin/review/route.ts
 * ---------------------------------------------------------------------------
 * Lightweight human-review queue for the moderation pipeline.
 *
 *   GET /api/admin/review[?status=pending_review|rejected|self_harm_blocked|published]
 *
 * Lists flagged messages that are NOT auto-published. This is the admin audit
 * view, so it includes the message content plus moderation metadata (flag
 * type, confidence, decision, model version). It does NOT include trigger
 * words — those are never stored anywhere in the system.
 *
 * Self-harm-blocked messages are included so a moderator can perform a
 * sensitive safety follow-up. They are clearly marked and the author has
 * ALREADY received the supportive response + crisis resources at submit time.
 *
 * Authorisation: when the `ADMIN_SECRET_TOKEN` env var is set, the request
 * must carry it in the `x-admin-token` header or `admin_token` cookie. When
 * unset (dev / pre-publish) the gate is a no-op so the dashboard stays
 * usable without a login UI.
 * ---------------------------------------------------------------------------
 */

import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin, noStoreResponse, serverErrorResponse } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set([
  "pending_review",
  "rejected",
  "self_harm_blocked",
  "published",
]);

export async function GET(req: NextRequest) {
  // Optional shared-secret admin gate (active only when ADMIN_SECRET_TOKEN
  // is set in the environment).
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");

    const where: Prisma.ExchangeMessageWhereInput = {};
    if (statusFilter && VALID_STATUSES.has(statusFilter)) {
      where.moderationStatus = statusFilter;
    } else {
      // Default: everything that is NOT cleanly published (i.e. needs attention).
      where.moderationStatus = {
        in: ["pending_review", "rejected", "self_harm_blocked"],
      };
    }

    const rows = await db.exchangeMessage.findMany({
      where,
      orderBy: [{ adminResolvedAt: "asc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        moderationLogs: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    const items = rows.map((r) => ({
      id: r.id,
      authorHandle: r.authorHandle,
      authorId: r.authorId,
      content: r.content,
      isHidden: r.isHidden,
      moderationStatus: r.moderationStatus,
      moderationFlagType: r.moderationFlagType,
      moderationConfidence: r.moderationConfidence,
      createdAt: r.createdAt.toISOString(),
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
      adminResolvedAt: r.adminResolvedAt ? r.adminResolvedAt.toISOString() : null,
      adminNote: r.adminNote,
      logs: r.moderationLogs.map((l) => ({
        id: l.id,
        flagType: l.flagType,
        confidence: l.confidence,
        decision: l.decision,
        modelVersion: l.modelVersion,
        createdAt: l.createdAt.toISOString(),
      })),
    }));

    // Summary counts for the dashboard header.
    const counts = await db.exchangeMessage.groupBy({
      by: ["moderationStatus"],
      _count: { _all: true },
    });
    const summary: Record<string, number> = {};
    for (const c of counts) {
      summary[c.moderationStatus] = c._count._all;
    }

    return noStoreResponse({ items, summary });
  } catch {
    return serverErrorResponse();
  }
}
