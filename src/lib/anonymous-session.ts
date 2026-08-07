/**
 * src/lib/anonymous-session.ts
 * ---------------------------------------------------------------------------
 * Cookie-based anonymous session for the reciprocal-unlock exchange.
 *
 * Why a session at all? The exchange must never hand a user back their OWN
 * message. To exclude the author's own bottles from the selection pool we
 * need a stable per-browser identifier that survives across requests — but
 * it must remain anonymous (no login, no PII, no fingerprinting beyond
 * "is this the same browser that submitted X").
 *
 * Design:
 *   - An HTTP-only cookie `bottle_session` holds an opaque 256-bit random
 *     token, generated server-side on first visit and valid for 1 year.
 *   - The database stores ONLY `sha256(token)` as the message's `authorId`.
 *     The raw token never touches the DB, so a DB leak cannot be correlated
 *     back to a cookie, and the cookie cannot be reversed to enumerate an
 *     author's rows.
 *   - HTTP-only + SameSite=Lax means the token is never readable by
 *     client-side JS and is only sent on same-site requests.
 *
 * This is the "anonymous session hash" referenced by the exchange spec
 * ("not authored by this same anonymous session/IP hash"). We prefer a
 * cookie over an IP hash because IPs are shared (NAT, carriers, cafés) and
 * rotate (mobile), which would both over-exclude (different people behind
 * one IP blocking each other) and under-exclude (one person across IPs).
 * ---------------------------------------------------------------------------
 */

import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const SESSION_COOKIE_NAME = "bottle_session";
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year (seconds)
const TOKEN_BYTES = 32; // 256-bit

export interface AnonymousSession {
  /** The raw opaque token (cookie value). Never stored in the DB. */
  token: string;
  /** sha256(token). Stored as ExchangeMessage.authorId; used for exclusion. */
  hash: string;
  /** True when the token was just generated (cookie needs to be set on the response). */
  isNew: boolean;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Read the anonymous session from the request cookie, or generate a fresh
 * one if none is present. Does NOT mutate the response — call
 * `setSessionCookieOnResponse` with the returned session to persist a new
 * token.
 */
export function getSessionFromRequest(req: NextRequest): AnonymousSession {
  const existing = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (existing && existing.length >= TOKEN_BYTES * 2) {
    // Re-hash the existing token for the authorId.
    return { token: existing, hash: hashToken(existing), isNew: false };
  }
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  return { token, hash: hashToken(token), isNew: true };
}

/**
 * If the session was just generated, set the HTTP-only cookie on the
 * response so it persists for subsequent requests. No-op for returning
 * sessions.
 */
export function setSessionCookieOnResponse(
  res: NextResponse,
  session: AnonymousSession,
): void {
  if (!session.isNew) return;
  res.cookies.set(SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: "/",
  });
}
