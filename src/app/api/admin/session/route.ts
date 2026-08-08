/**
 * src/app/api/admin/session/route.ts
 * ---------------------------------------------------------------------------
 * Minimal admin session gate for the moderation dashboard.
 *
 *   GET    /api/admin/session        → { admin: boolean }  (is the current
 *                                                         visitor an admin?)
 *   POST   /api/admin/session        → { ok: true }        (login: body
 *                                                          { token: string })
 *   DELETE /api/admin/session        → { ok: true }        (logout: clear cookie)
 *
 * Why this exists: the AdminReviewDashboard tab was previously rendered for
 * every visitor. The underlying /api/admin/review endpoints are protected by
 * `requireAdmin` (cookie or header), but the UI tab itself was always visible
 * — which is both confusing for end users and a poor security posture. This
 * route lets the page ask "am I an admin?" and lets the operator log in via a
 * simple token POST (which sets an httpOnly cookie) so the tab can appear.
 *
 * Auth model:
 *   - When `ADMIN_SECRET_TOKEN` env is NOT set:
 *       Admin is DISABLED. No one can log in, and `isAdmin(req)` returns
 *       false. This is the safe default — we never auto-open admin in dev,
 *       because that leaks the moderation dashboard to every visitor in the
 *       preview. The operator MUST set `ADMIN_SECRET_TOKEN` in `.env` to
 *       enable the tab.
 *   - When `ADMIN_SECRET_TOKEN` env IS set: a POST with the matching token
 *     sets a `admin_token` httpOnly cookie (SameSite=Lax, 30 days). Subsequent
 *     requests are authenticated via that cookie (mirrored by `requireAdmin`
 *     in api-helpers.ts).
 *
 * The cookie is the SAME one `requireAdmin` reads, so once the operator logs
 * in here, every /api/admin/* call is authenticated automatically — no
 * client-side header injection needed.
 * ---------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "admin_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * Is the current request authenticated as an admin?
 * Mirrors the logic of `requireAdmin` but returns a boolean instead of a
 * response, so the GET handler can report status to the client.
 *
 *   - No `ADMIN_SECRET_TOKEN` configured → false (admin disabled).
 *   - Token configured → cookie/header must match.
 */
function isAdmin(req: NextRequest): boolean {
  const expected = process.env.ADMIN_SECRET_TOKEN;
  if (!expected) {
    return false;
  }
  const headerToken = req.headers.get("x-admin-token");
  const cookieToken = req.cookies.get(COOKIE_NAME)?.value;
  return headerToken === expected || cookieToken === expected;
}

/** Constant-time string compare to avoid timing-based token enumeration. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function GET(req: NextRequest) {
  return NextResponse.json(
    { admin: isAdmin(req) },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function POST(req: NextRequest) {
  const expected = process.env.ADMIN_SECRET_TOKEN;
  // With no token configured, login is permanently disabled (dev or prod).
  // The operator must set ADMIN_SECRET_TOKEN in .env to enable the dashboard.
  if (!expected) {
    return NextResponse.json(
      { error: "Admin access is not configured." },
      { status: 503 },
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
  const fields =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const token = typeof fields.token === "string" ? fields.token : "";

  if (!token || !safeEqual(token, expected)) {
    // 401 (not 403) — the caller needs to provide credentials.
    return NextResponse.json(
      { error: "Invalid token." },
      { status: 401 },
    );
  }

  // Set the httpOnly cookie. SameSite=Lax is enough (admin pages are
  // same-origin); Secure is on in production automatically via Vercel HTTPS.
  const res = NextResponse.json({ ok: true, admin: true });
  res.cookies.set({
    name: COOKIE_NAME,
    value: expected,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true, admin: false });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
