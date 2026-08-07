/**
 * src/lib/private-token.ts
 * ---------------------------------------------------------------------------
 * Generates the unguessable "my bottle" link token handed back to an author
 * exactly once, at publish time. The token is the sole proof of ownership
 * for revisiting a bottle's private reading room (reactions + quick-word
 * replies) — there is no login, no account, no second factor. Anyone in
 * possession of the link can view that bottle's reactions, so the author is
 * told to keep it private.
 *
 * The token is stored verbatim on `ExchangeMessage.privateToken` (a UNIQUE
 * nullable column). Storing it raw (rather than a hash) is acceptable here
 * because:
 *   - the token's job is unguessability over the wire, not DB-leak defence
 *     (a DB leak already exposes all message content);
 *   - lookups by token need to be a single indexed SELECT, which a hash
 *     would still allow (hash the incoming token, then SELECT), but the raw
 *     form keeps the read path trivially simple.
 *
 * 192 bits of entropy (24 random bytes, base64url → 32 chars) is far beyond
 * what offline enumeration could ever touch.
 * ---------------------------------------------------------------------------
 */

import { randomBytes } from "node:crypto";

const TOKEN_BYTES = 24; // 192-bit

/**
 * Generate a fresh, URL-safe, unguessable private bottle token.
 * Example output: `A3fK9x...` (32 chars, base64url, no padding).
 */
export function generatePrivateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Validate the shape of a token presented in a URL query. Cheap syntactic
 * check (length + charset) so we can 404 obviously-bad links without hitting
 * the DB. base64url alphabet: [A-Za-z0-9_-].
 */
export function isValidTokenShape(token: unknown): token is string {
  if (typeof token !== "string") return false;
  if (token.length < 16 || token.length > 64) return false;
  return /^[A-Za-z0-9_-]+$/.test(token);
}
