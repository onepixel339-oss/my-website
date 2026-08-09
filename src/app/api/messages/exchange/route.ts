/**
 * src/app/api/messages/exchange/route.ts
 * ---------------------------------------------------------------------------
 * Reciprocal-unlock exchange endpoint — the heart of the bottle app.
 *
 *   POST /api/messages/exchange
 *     Body: { content: string, category?: BottleCategoryKey, language?: string }
 *
 *     A user can ONLY receive a random message AFTER their own submission
 *     is successfully stored server-side. The entire exchange (write +
 *     select + increment) happens in a SINGLE server-side transaction, so
 *     there is no "read" endpoint a client could call to bypass writing.
 *
 *     Pipeline:
 *       1. Validate content (10–500 chars) + optional category + capsule.
 *       2. PII gate   — reject (never store) before moderation, same as
 *                       /api/messages. Runs BEFORE the rate-limit so a
 *                       legitimate user who accidentally includes a phone
 *                       number does NOT lose a daily-throw slot (PII is a
 *                       user error, not spam).
 *       3. Rate limit — 5 throws / 24h per session. Runs before the
 *                       expensive captcha / duplicate / moderation gates
 *                       so a flooding session is rejected cheaply. Later-
 *                       rejected attempts (captcha / duplicate / moderation)
 *                       DO count toward the daily quota (spam should consume
 *                       quota).
 *       4. Captcha    — Cloudflare Turnstile (env-gated).
 *       5. Near-duplicate detection — Levenshtein against recent submissions.
 *       6. Moderation — synchronous LLM classifier. The exchange ONLY
 *                       proceeds to the read step when the author's message
 *                       PASSES moderation (decision = "publish"). If the
 *                       message is rejected / held / self-harm-blocked, it
 *                       is still stored (hidden) but NO bottle is returned.
 *       7. In a single $transaction:
 *            a. INSERT the new message (authorId = sha256(session cookie),
 *               source = "bottle", is_hidden = false, published).
 *            b. INSERT the ModerationLog audit row.
 *            c. SELECT a random OTHER message from the eligible pool
 *               (tier-based, filters relaxed until a candidate is found;
 *               seed bottles always excluded).
 *            d. INCREMENT the selected message's reveal_count.
 *       8. Return { status, message: <own>, received: <other> | null }.
 * ---------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  moderateMessage,
  buildSelfHarmSupportPayload,
  GENERIC_REJECTION_NOTICE,
  REVIEW_PENDING_NOTICE,
  MANUAL_REVIEW_PENDING_NOTICE,
} from "@/lib/moderation";
import { filterMessage } from "@/lib/pii-filter";
import { detectLanguage } from "@/lib/language-detect";
import { parseBottleCategory } from "@/lib/bottle-categories";
import { getSessionFromRequest } from "@/lib/anonymous-session";
import { generatePrivateToken } from "@/lib/private-token";
import { consumeThrowAttempt } from "@/lib/rate-limit";
import { findNearDuplicate } from "@/lib/duplicate-detector";
import { verifyTurnstileToken, extractClientIp } from "@/lib/turnstile";
import {
  parseJsonBody,
  getStringField,
  BOTTLE_SELECT,
  toPublicBottle,
  pickAnonymousHandle,
  statusByDecision,
  finalizeResponse,
  serverErrorResponse,
} from "@/lib/api-helpers";
import type { PublicBottle } from "@/components/bottle/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Composer limits (mirrored on the client).
const MIN_CONTENT = 10;
const MAX_CONTENT = 500;

// ---------------------------------------------------------------------------
// Time Capsule — optional delay before a bottle enters the shared pool.
// ---------------------------------------------------------------------------

export type CapsuleDelay = "now" | "24h" | "7d" | "1y";

const DELAY_MS: Record<CapsuleDelay, number> = {
  now: 0,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
};

/** Parse + validate the optional `visible_after_delay` from the request. */
function parseCapsuleDelay(raw: unknown): CapsuleDelay {
  if (typeof raw !== "string") return "now";
  if (raw === "now" || raw === "24h" || raw === "7d" || raw === "1y") return raw;
  return "now";
}

/** Compute the `visibleAfter` timestamp for a delay. `null` = visible now. */
function computeVisibleAfter(delay: CapsuleDelay): Date | null {
  if (delay === "now") return null;
  return new Date(Date.now() + DELAY_MS[delay]);
}

// ---------------------------------------------------------------------------
// Received-bottle selection (runs inside the transaction)
// ---------------------------------------------------------------------------

interface PreferredFilters {
  language?: string;
  category?: string;
}

/**
 * Build the selection for the received bottle. Tries the preferred
 * language+category first, then relaxes filters until a candidate is found.
 *
 * Selection algorithm (per spec): order by reveal_count ASC, then pick at
 * random within the LOWEST tier. This spreads exposure evenly without a hard
 * cap that could exclude every bottle once they've all been shown N times.
 *
 * Seed bottles (system-generated starter content) are ALWAYS excluded —
 * only real, user-authored bottles are ever handed back to a reader.
 */
async function selectReceivedBottle(
  tx: Prisma.TransactionClient,
  ownAuthorHash: string,
  preferred: PreferredFilters,
): Promise<PublicBottle | null> {
  // Filter relaxation ladder: most-specific → least-specific.
  const levels: PreferredFilters[] = [
    { language: preferred.language, category: preferred.category },
    { language: preferred.language },
    { category: preferred.category },
    {},
  ];

  for (const filters of levels) {
    const where: Prisma.ExchangeMessageWhereInput = {
      source: "bottle",
      isHidden: false,
      moderationStatus: "published",
      authorId: { not: ownAuthorHash },
      isSeed: false,
      ...(filters.language ? { language: filters.language } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      // --- Time Capsule gate ---
      // A bottle with `visibleAfter` in the future is NOT yet in the shared
      // pool. Eligible if visibleAfter is null (no delay) OR visibleAfter <= now.
      OR: [{ visibleAfter: null }, { visibleAfter: { lte: new Date() } }],
    };

    // Find the minimum reveal_count among eligible messages (the lowest tier).
    const agg = await tx.exchangeMessage.aggregate({
      where,
      _min: { revealCount: true },
    });
    const minReveal = agg._min.revealCount;
    if (minReveal === null) continue; // no candidates at this filter level

    // Gather every message in that lowest tier, then pick one at random.
    const candidates = await tx.exchangeMessage.findMany({
      where: { ...where, revealCount: minReveal },
      select: BOTTLE_SELECT,
    });
    if (candidates.length === 0) continue;

    const chosen = candidates[Math.floor(Math.random() * candidates.length)]!;

    // Increment the chosen bottle's reveal_count atomically within the
    // same transaction. Return the post-increment value.
    const updated = await tx.exchangeMessage.update({
      where: { id: chosen.id },
      data: { revealCount: { increment: 1 } },
      select: BOTTLE_SELECT,
    });

    return toPublicBottle(updated);
  }

  // Exhausted all filter levels with no candidates. This happens when the
  // real (non-seed) pool is empty — the client shows the "still drifting"
  // empty state. We fail safe rather than throw.
  return null;
}

// ---------------------------------------------------------------------------
// POST — reciprocal-unlock exchange
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // --- anonymous session -------------------------------------------------
  const session = getSessionFromRequest(req);

  try {
    const parsed = await parseJsonBody(req);
    if (!parsed.ok) {
      return finalizeResponse(req, session, parsed.response);
    }
    const data = parsed.data;

    // --- validate content --------------------------------------------------
    const content = getStringField(data, "content").trim();
    if (!content) {
      return finalizeResponse(
        req,
        session,
        NextResponse.json(
          { status: "invalid", error: "Write something before casting your bottle." },
          { status: 400 },
        ),
      );
    }
    if (content.length < MIN_CONTENT) {
      return finalizeResponse(
        req,
        session,
        NextResponse.json(
          {
            status: "invalid",
            error: `Your message is a little short — at least ${MIN_CONTENT} characters helps it land.`,
          },
          { status: 400 },
        ),
      );
    }
    if (content.length > MAX_CONTENT) {
      return finalizeResponse(
        req,
        session,
        NextResponse.json(
          {
            status: "invalid",
            error: `Bottles are limited to ${MAX_CONTENT} characters. Trim it a little?`,
          },
          { status: 400 },
        ),
      );
    }

    // --- optional category + preferred language + capsule delay ------------
    const category = parseBottleCategory(
      typeof data === "object" && data !== null && "category" in data
        ? (data as Record<string, unknown>).category
        : undefined,
    );
    // The client may pass a preferred language to match against; if absent we
    // don't filter by language (the selection relaxes anyway).
    const preferredLanguageRaw = getStringField(data, "language");
    const preferredLanguage =
      preferredLanguageRaw.length >= 2 && preferredLanguageRaw.length <= 8
        ? preferredLanguageRaw.slice(0, 8)
        : undefined;
    // --- Time Capsule: optional delay before the bottle enters the shared pool.
    const capsuleDelay = parseCapsuleDelay(
      typeof data === "object" && data !== null && "visible_after_delay" in data
        ? (data as Record<string, unknown>).visible_after_delay
        : undefined,
    );
    const visibleAfter = computeVisibleAfter(capsuleDelay);

    // === PII GATE (before rate-limit + moderation + INSERT) ================
    // Cheap, synchronous, regex-based. Runs BEFORE the rate-limit so a
    // legitimate user who accidentally includes a phone number does NOT lose
    // a daily-throw slot (PII is a user error, not spam). On detection the
    // submission is stored HIDDEN + pending_review for the admin to decide
    // (the author is NOT told what was found, only that their message was
    // held). The message is never auto-published — the admin must explicitly
    // approve it if they want it to appear (e.g. after confirming the phone
    // number is the author's own and they consent to sharing it).
    const pii = filterMessage(content);
    if (!pii.ok) {
      await db.$transaction(async (tx) => {
        const message = await tx.exchangeMessage.create({
          data: {
            authorId: session.hash,
            authorHandle: pickAnonymousHandle(),
            content,
            category,
            language: detectLanguage(content),
            source: "bottle",
            isHidden: true,
            moderationStatus: "pending_review",
            moderationFlagType: "doxxing",
            moderationConfidence: 1,
          },
        });
        await tx.moderationLog.create({
          data: {
            messageId: message.id,
            flagType: "doxxing",
            confidence: 1,
            decision: "pending_review",
            modelVersion: "pii-filter-v1",
          },
        });
      });
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

    // === RATE LIMIT (5 throws / 24h per session) ==========================
    // Server-side sliding window (in-memory, race-free) + durable DB backstop.
    // Runs after PII (so PII errors are free) but before the expensive captcha
    // / duplicate / moderation gates. Later-rejected attempts (captcha /
    // duplicate / moderation) DO count toward the daily quota — spam should
    // consume quota. Returns a GENTLE 200 (never a raw 429).
    const throwLimit = await consumeThrowAttempt(session.hash);
    if (!throwLimit.allowed) {
      return finalizeResponse(
        req,
        session,
        NextResponse.json({
          status: "rate_limited",
          distributed: false,
          limit: throwLimit.limit,
          retry_after_ms: throwLimit.retryAfterMs,
          notice: "You've thrown enough bottles for today — come back tomorrow 🌊",
        }),
      );
    }

    // === CAPTCHA (Cloudflare Turnstile, env-gated) ========================
    // Invisible CAPTCHA on the submit action. When configured, the frontend
    // attaches a Turnstile token; we verify it server-side here. In dev /
    // this sandbox (no creds) verification bypasses so the app stays
    // functional. Runs before the expensive LLM moderation.
    const captchaTokenRaw = getStringField(data, "captcha_token");
    const captcha = await verifyTurnstileToken(
      captchaTokenRaw.length > 0 ? captchaTokenRaw : null,
      extractClientIp(req),
    );
    if (!captcha.success) {
      return finalizeResponse(
        req,
        session,
        NextResponse.json({
          status: "captcha_failed",
          distributed: false,
          bypass: captcha.bypass,
          notice: "We couldn't quite tell you're human — try once more?",
        }),
      );
    }

    // === NEAR-DUPLICATE DETECTION =========================================
    // Block copy-paste spam floods: compare this submission (normalised)
    // against the session's recent submissions via Levenshtein edit-distance
    // ratio. Runs after PII (clean content) and before moderation (don't
    // waste the LLM on duplicates). A duplicate is NOT stored.
    const recentRows = await db.exchangeMessage.findMany({
      where: { authorId: session.hash },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { content: true },
    });
    const dup = findNearDuplicate(content, recentRows.map((r) => r.content));
    if (dup) {
      return finalizeResponse(
        req,
        session,
        NextResponse.json({
          status: "duplicate",
          distributed: false,
          ratio: dup.ratio,
          notice:
            "You just sent something very like that — let a different thought drift out.",
        }),
      );
    }

    // === MODERATION GATE ==================================================
    // Synchronous, BEFORE the INSERT. The exchange only proceeds to the read
    // step when the decision is "publish" — OR when the message is a clean
    // "manual hold" (pendingManualApproval): the classifier said it's fine,
    // but the operator requires explicit approval before it joins the public
    // feed. In that case the author STILL receives a bottle (their message is
    // almost certainly fine); their own message is stored hidden+pending until
    // the admin approves it.
    const moderation = await moderateMessage(content);
    const manualHold = moderation.pendingManualApproval === true;

    // Non-publish decisions that are NOT a manual hold: store (hidden) and
    // return the moderation outcome WITHOUT a received bottle. These cover
    // self_harm_block, reject, and borderline pending_review.
    if (moderation.decision !== "publish" && !manualHold) {
      const moderationStatus = statusByDecision[moderation.decision];

      await db.$transaction(async (tx) => {
        const message = await tx.exchangeMessage.create({
          data: {
            authorId: session.hash,
            authorHandle: pickAnonymousHandle(),
            content,
            category,
            language: detectLanguage(content),
            source: "bottle",
            isHidden: true,
            moderationStatus,
            moderationFlagType: moderation.flagType,
            moderationConfidence: moderation.confidence,
          },
        });
        await tx.moderationLog.create({
          data: {
            messageId: message.id,
            flagType: moderation.flagType,
            confidence: moderation.confidence,
            decision: moderation.decision,
            modelVersion: moderation.modelVersion,
          },
        });
      });

      if (moderation.decision === "self_harm_block") {
        return finalizeResponse(
          req,
          session,
          NextResponse.json({
            status: "self_harm_blocked",
            distributed: false,
            support: buildSelfHarmSupportPayload(),
          }),
        );
      }
      if (moderation.decision === "reject") {
        return finalizeResponse(
          req,
          session,
          NextResponse.json({
            status: "rejected",
            distributed: false,
            notice: GENERIC_REJECTION_NOTICE,
          }),
        );
      }
      return finalizeResponse(
        req,
        session,
        NextResponse.json({
          status: "pending_review",
          distributed: false,
          notice: REVIEW_PENDING_NOTICE,
        }),
      );
    }

    // === PUBLISH / MANUAL-HOLD + RECIPROCAL UNLOCK (single transaction) ===
    // Insert the author's message, then select + increment a random OTHER
    // bottle from the eligible pool. Both happen in one $transaction so the
    // write and the read are atomic.
    //
    // Two sub-cases reach this branch:
    //   - decision === "publish": the message is published immediately
    //     (is_hidden = false, moderationStatus = "published", publishedAt = now).
    //   - manualHold (pendingManualApproval): the classifier scored the
    //     message as clean, but the operator requires explicit admin approval.
    //     The message is stored hidden+pending_review; the author STILL gets a
    //     received bottle + private token. Once the admin approves it (POST
    //     /api/admin/review/[id] { action: "approve" }), it flips to published
    //     and joins the public feed.
    const language = detectLanguage(content);

    const result = await db.$transaction(async (tx) => {
      const ownPrivateToken = generatePrivateToken();

      // (a) Insert the new message. In manual-hold mode it is stored hidden
      //     and pending so it never appears in the feed until the admin
      //     approves it.
      const own = await tx.exchangeMessage.create({
        data: {
          authorId: session.hash,
          authorHandle: pickAnonymousHandle(),
          content,
          category,
          language,
          source: "bottle",
          isHidden: manualHold ? true : false,
          moderationStatus: manualHold ? "pending_review" : "published",
          moderationFlagType: moderation.flagType,
          moderationConfidence: moderation.confidence,
          publishedAt: manualHold ? null : new Date(),
          privateToken: ownPrivateToken,
          visibleAfter,
        },
        select: BOTTLE_SELECT,
      });

      // (b) Audit log.
      await tx.moderationLog.create({
        data: {
          messageId: own.id,
          flagType: moderation.flagType,
          confidence: moderation.confidence,
          decision: moderation.decision,
          modelVersion: moderation.modelVersion,
        },
      });

      // (c) Select + increment a random OTHER bottle (tier-based, filters
      // relaxed until a candidate is found). Seed bottles are ALWAYS excluded.
      const received = await selectReceivedBottle(tx, session.hash, {
        language: preferredLanguage,
        category: category ?? undefined,
      });

      return { own: toPublicBottle(own), received, ownPrivateToken };
    });

    return finalizeResponse(
      req,
      session,
      NextResponse.json({
        status: manualHold ? "pending_review" : "published",
        // Manual hold still distributes a received bottle to the author; the
        // hold only affects whether the AUTHOR'S message is publicly visible.
        distributed: true,
        manual_hold: manualHold ? true : undefined,
        // Shown to the author when their clean message is held for review.
        notice: manualHold ? MANUAL_REVIEW_PENDING_NOTICE : undefined,
        message: result.own,
        received: result.received,
        // The author's private revisit token. Returned EXACTLY ONCE.
        private_token: result.ownPrivateToken,
        // Time Capsule: echoes the chosen delay + the computed visibleAfter.
        capsule_delay: capsuleDelay,
        visible_after: visibleAfter ? visibleAfter.toISOString() : null,
      }),
    );
  } catch {
    return finalizeResponse(req, session, serverErrorResponse());
  }
}
