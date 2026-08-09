/**
 * src/lib/bottle-tokens-client.ts
 * ---------------------------------------------------------------------------
 * CLIENT-SIDE persistence of the author's own bottle tokens.
 *
 * Problem this solves:
 *   The exchange endpoint returns a `private_token` exactly ONCE at publish
 *   time. Previously the only way to revisit your bottle (to see reactions
 *   + quick-word replies) was to manually copy the `/?bottle=<token>` link
 *   shown in the drifting section. If the author closed the tab without
 *   copying it, access to their own bottle's reactions/replies was lost
 *   forever — no cookie, no localStorage, no recovery path.
 *
 * Solution:
 *   On every successful publish, the composer calls `rememberBottle()` with
 *   the new token + a short content preview. We store up to N tokens in
 *   localStorage (most-recent-first), so the author always has a way back
 *   via the "My Bottles" menu in the header.
 *
 * Privacy:
 *   - The token is the ONLY way to view a bottle's reactions. Storing it in
 *     localStorage means anyone with access to THIS BROWSER can see those
 *     reactions. That is the same trust model as the existing session cookie
 *     and is acceptable for an anonymous, no-login app. The "Save your
 *     bottle" panel already warns the author to keep the link private.
 *   - We store ONLY the token + a 60-char preview + a timestamp. No message
 *     body, no author identity.
 *
 * All functions are SSR-safe (no-op when `window` is undefined) so they can
 * be imported from client components without guarding every call site.
 * -------------------------------------------------------------------------
 */

const STORAGE_KEY = "bottle.tokens.v1";
const MAX_BOTTLES = 20;
const PREVIEW_MAX = 60;

export interface SavedBottle {
  /** The private token — possession = authorisation to view reactions. */
  token: string;
  /** Short content preview (≤60 chars) for the menu list. */
  preview: string;
  /** When the bottle was thrown (epoch ms). */
  createdAt: number;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeParse(raw: string | null): SavedBottle[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is SavedBottle =>
          typeof x === "object" &&
          x !== null &&
          typeof (x as SavedBottle).token === "string" &&
          typeof (x as SavedBottle).preview === "string" &&
          typeof (x as SavedBottle).createdAt === "number",
      )
      .slice(0, MAX_BOTTLES);
  } catch {
    return [];
  }
}

/**
 * Read the list of saved bottles (most-recent-first).
 * Returns [] on the server or if storage is empty/corrupt.
 */
export function listSavedBottles(): SavedBottle[] {
  if (!isBrowser()) return [];
  try {
    return safeParse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

/**
 * Persist a new bottle token. Dedupes by token, caps at MAX_BOTTLES
 * (drops the oldest), and stores most-recent-first.
 *
 * @param token   The private revisit token.
 * @param preview A short snippet of the message body (will be truncated).
 */
export function rememberBottle(token: string, preview: string): void {
  if (!isBrowser()) return;
  if (!token || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) return;
  const trimmedPreview = preview.trim().slice(0, PREVIEW_MAX);
  const now = Date.now();

  const existing = safeParse(window.localStorage.getItem(STORAGE_KEY));
  // Drop any existing entry with the same token (idempotent re-save).
  const filtered = existing.filter((b) => b.token !== token);
  // Prepend the new one.
  const next = [{ token, preview: trimmedPreview, createdAt: now }, ...filtered].slice(
    0,
    MAX_BOTTLES,
  );
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / privacy mode — silently no-op */
  }
}

/**
 * Remove a saved bottle by token. Used if the author visits a bottle link
 * that turns out to be invalid (drifted away) so the menu doesn't keep a
 * dead entry.
 */
export function forgetBottle(token: string): void {
  if (!isBrowser()) return;
  if (!token) return;
  const existing = safeParse(window.localStorage.getItem(STORAGE_KEY));
  const next = existing.filter((b) => b.token !== token);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/** Build the deep-link URL for a token, relative to the current origin. */
export function bottleUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/?bottle=${encodeURIComponent(token)}`;
}
