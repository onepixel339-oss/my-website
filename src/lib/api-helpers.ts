/**
 * src/lib/api-helpers.ts
 * ---------------------------------------------------------------------------
 * Shared utilities for the bottle-app API routes. Centralises the patterns
 * that were previously duplicated 2-4× across route handlers:
 *
 *   - parseJsonBody      — safe req.json() with a 400 fallback
 *   - BOTTLE_SELECT      — the canonical Prisma column selection for a public
 *                          bottle row (used by feed, exchange, my-bottle)
 *   - toPublicBottle     — maps a Prisma row to the anonymous snake_case API
 *                          shape (no authorId / authorHandle / privateToken)
 *   - pickAnonymousHandle / generateAnonymousAuthorId
 *                        — server-generated opaque author identity
 *   - statusByDecision   — ModerationDecision → DB moderationStatus string
 *   - finalizeResponse   — set the session cookie on the response when the
 *                          session was just generated (every code path goes
 *                          through here so a first-time visitor always gets
 *                          their cookie, even on error responses)
 *   - sanitizeMessageId / sanitizeHandle / sanitizeContent
 *                        — input validators reused across [id] routes
 *   - requireAdmin       — optional shared-secret gate for admin routes
 *                          (active only when ADMIN_SECRET_TOKEN env is set)
 *   - noStoreResponse    — NextResponse.json with Cache-Control: no-store
 *   - serverErrorResponse— gentle 500 with a `status: "error"` body
 *   - createTtlCache     — generic in-process TTL cache factory
 *
 * Importing `PublicBottle` as a **type-only** import from
 * `@/components/bottle/types` keeps a single canonical definition without
 * pulling client runtime code into the server bundle (types are erased at
 * compile time).
 * -------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import type { PublicBottle } from "@/components/bottle/types";
import type { ModerationDecision } from "@/lib/moderation";
import {
  setSessionCookieOnResponse,
  type AnonymousSession,
} from "@/lib/anonymous-session";

// ---------------------------------------------------------------------------
// JSON body parsing
// ---------------------------------------------------------------------------

/**
 * Parse the request body as JSON. Returns a discriminated union so the
 * caller can branch on `ok` without an unsound `as Record<string, unknown>`
 * cast on a possibly-null / array / primitive body.
 */
export async function parseJsonBody(
  req: NextRequest,
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; response: NextResponse }
> {
  try {
    const body: unknown = await req.json();
    return { ok: true, data: body };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      ),
    };
  }
}

/**
 * Narrow an unknown parsed body to a string field, returning "" for anything
 * that isn't a string. Avoids the unsound `body as Record<string, unknown>`
 * pattern — callers access fields via `getStringField(data, "content")`.
 */
export function getStringField(
  data: unknown,
  field: string,
): string {
  if (typeof data === "object" && data !== null && field in data) {
    const v = (data as Record<string, unknown>)[field];
    return typeof v === "string" ? v : "";
  }
  return "";
}

// ---------------------------------------------------------------------------
// Public bottle shape (anonymous — no author identifiers)
// ---------------------------------------------------------------------------

/** Canonical Prisma column selection for a public bottle row. */
export const BOTTLE_SELECT = {
  id: true,
  content: true,
  category: true,
  language: true,
  createdAt: true,
  revealCount: true,
  reportedCount: true,
  isHidden: true,
  reactionsHeart: true,
  reactionsSmile: true,
  reactionsFeelYou: true,
} satisfies Prisma.ExchangeMessageSelect;

/** Input shape accepted by toPublicBottle (any Prisma row with these fields). */
interface BottleRow {
  id: string;
  content: string;
  category: string | null;
  language: string;
  createdAt: Date;
  revealCount: number;
  reportedCount: number;
  isHidden: boolean;
  reactionsHeart: number;
  reactionsSmile: number;
  reactionsFeelYou: number;
}

/** Map a Prisma row to the anonymous snake_case public bottle shape. */
export function toPublicBottle(row: BottleRow): PublicBottle {
  return {
    id: row.id,
    content: row.content,
    category: row.category,
    language: row.language,
    created_at: row.createdAt.toISOString(),
    reveal_count: row.revealCount,
    reported_count: row.reportedCount,
    is_hidden: row.isHidden,
    reactions_heart: row.reactionsHeart,
    reactions_smile: row.reactionsSmile,
    reactions_feel_you: row.reactionsFeelYou,
  };
}

// ---------------------------------------------------------------------------
// Poetic anonymous handle (internal — never returned to readers)
// ---------------------------------------------------------------------------

const ANONYMOUS_HANDLES = [
  "Quiet tide",
  "Drifting shore",
  "Open sea",
  "Wandering wave",
  "Distant light",
  "Calm harbour",
  "Saltwind",
  "Far coast",
  "Still water",
  "Evening swell",
] as const;

/** Pick a random poetic handle from the sea-themed list. */
export function pickAnonymousHandle(): string {
  return ANONYMOUS_HANDLES[
    Math.floor(Math.random() * ANONYMOUS_HANDLES.length)
  ];
}

/** Generate an opaque anonymous authorId (NOT the session hash). */
export function generateAnonymousAuthorId(): string {
  return "anon-" + crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Moderation decision → DB status mapping
// ---------------------------------------------------------------------------

/** Maps a ModerationDecision to the DB moderationStatus string. */
export const statusByDecision: Record<ModerationDecision, string> = {
  publish: "published",
  self_harm_block: "self_harm_blocked",
  reject: "rejected",
  pending_review: "pending_review",
};

// ---------------------------------------------------------------------------
// Session cookie finalisation
// ---------------------------------------------------------------------------

/**
 * Set the session cookie on the response when the session was just generated.
 * Every code path in a session-aware route should go through here so a
 * first-time visitor always receives their cookie — even on error responses
 * and gentle rejections.
 */
export function finalizeResponse(
  _req: NextRequest,
  session: AnonymousSession,
  res: NextResponse,
): NextResponse {
  if (session.isNew) {
    setSessionCookieOnResponse(res, session);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Input sanitisers (reused across [id] routes)
// ---------------------------------------------------------------------------

/**
 * Validate a message id from a URL param: must be a trimmed non-empty string
 * of <= 64 chars. Returns null on failure.
 */
export function sanitizeMessageId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t || t.length > 64) return null;
  return t;
}

/**
 * Validate an author handle: trimmed, non-empty, <= maxLen chars. No charset
 * whitelist (handles are display-only and React-escaped on render).
 */
export function sanitizeHandle(raw: unknown, maxLen: number): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t || t.length > maxLen) return null;
  return t;
}

/**
 * Validate free-text content: trimmed, non-empty, <= maxLen chars. Returns
 * null on failure (caller decides whether empty is a 400).
 */
export function sanitizeContent(raw: unknown, maxLen: number): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t || t.length > maxLen) return null;
  return t;
}

// ---------------------------------------------------------------------------
// Admin auth (shared-secret gate)
// ---------------------------------------------------------------------------

/**
 * Admin authorisation gate.
 *
 *   - When `ADMIN_SECRET_TOKEN` is set: the request must carry the matching
 *     token in either the `x-admin-token` header or the `admin_token` cookie
 *     (the cookie is set by POST /api/admin/session on login).
 *   - When `ADMIN_SECRET_TOKEN` is NOT set: DENY. The operator must set
 *     `ADMIN_SECRET_TOKEN` in `.env` to enable the moderation dashboard.
 *     We never auto-open admin in dev, because that leaks the dashboard to
 *     every visitor in the preview.
 *
 * Returns a 401 NextResponse when access is denied, or null when allowed.
 */
export function requireAdmin(req: NextRequest): NextResponse | null {
  const expected = process.env.ADMIN_SECRET_TOKEN;
  if (!expected) {
    // No token configured — deny in every environment.
    return NextResponse.json(
      { error: "Admin access is not configured." },
      { status: 503 },
    );
  }
  const headerToken = req.headers.get("x-admin-token");
  const cookieToken = req.cookies.get("admin_token")?.value;
  if (headerToken === expected || cookieToken === expected) return null;
  return NextResponse.json(
    { error: "Authorisation required." },
    { status: 401 },
  );
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/** Headers that prevent caching of per-session / frequently-changing data. */
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

/** Wrap a JSON response with Cache-Control: no-store. */
export function noStoreResponse(
  body: unknown,
  init?: { status?: number },
): NextResponse {
  return NextResponse.json(body, {
    status: init?.status,
    headers: NO_STORE_HEADERS,
  });
}

/**
 * Gentle 500 response for unexpected server errors. Carries a `status:
 * "error"` field and a calm notice so the UI can surface it without exposing
 * internals. Used as the catch-all in every route's top-level try/catch.
 */
export function serverErrorResponse(notice?: string): NextResponse {
  return NextResponse.json(
    {
      status: "error",
      distributed: false,
      notice:
        notice ??
        "The sea is rough right now — try again in a moment.",
    },
    { status: 500 },
  );
}

// ---------------------------------------------------------------------------
// Generic in-process TTL cache
// ---------------------------------------------------------------------------

/**
 * A minimal in-process TTL cache. Stores a single computed value with an
 * expiry timestamp; `get()` returns null once the TTL has elapsed. Used by
 * wall-of-gems (24h) and exchange-stats (3s) to coalesce concurrent reads.
 *
 * The cached value is opaque — callers store their full payload (including
 * any `refreshedAt` / `asOf` metadata) as the value.
 */
export interface TtlCache<T> {
  get(): T | null;
  set(value: T): void;
  reset(): void;
}

export function createTtlCache<T>(ttlMs: number): TtlCache<T> {
  let entry: { value: T; expiresAt: number } | null = null;
  return {
    get(): T | null {
      if (entry && entry.expiresAt > Date.now()) return entry.value;
      return null;
    },
    set(value: T): void {
      entry = { value, expiresAt: Date.now() + ttlMs };
    },
    reset(): void {
      entry = null;
    },
  };
}
