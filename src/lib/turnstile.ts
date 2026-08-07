/**
 * src/lib/turnstile.ts
 * ---------------------------------------------------------------------------
 * Cloudflare Turnstile — invisible CAPTCHA for the bottle submit action.
 *
 *   - The frontend renders an invisible Turnstile widget (when configured)
 *     which produces a one-time token. The token is sent with the throw
 *     request and verified HERE, server-side, before any storage.
 *   - Verification POSTs the token + secret to Cloudflare's siteverify
 *     endpoint. `success: true` ⇒ human.
 *   - **Env-gated**: Turnstile is only active when BOTH
 *     `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are set. When either is
 *     absent (e.g. local dev, this sandbox), verification is BYPASSED — the
 *     endpoint returns `{ success: true, bypass: true }` so the app remains
 *     fully functional without Cloudflare credentials. In production you set
 *     both env vars and the invisible CAPTCHA activates with zero code
 *     changes.
 *
 * Why env-gated rather than hard-required: Turnstile needs a real Cloudflare
 * account + site key to issue tokens, which can't be provisioned in a sealed
 * sandbox. The gate keeps the integration production-ready while letting the
 * app run anywhere. The site key is exposed to the browser (it's public) via
 * GET /api/turnstile/config; the secret never leaves the server.
 * -------------------------------------------------------------------------
 */

const SITE_KEY = process.env.TURNSTILE_SITE_KEY ?? "";
const SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? "";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Minimum plausible token length (Turnstile tokens are long JWT-ish strings). */
const MIN_TOKEN_LEN = 16;

export interface TurnstileVerification {
  success: boolean;
  /** True when verification was skipped because Turnstile isn't configured. */
  bypass: boolean;
  /** Cloudflare error codes, when present (for logging only — never surfaced
   *  to the client, to avoid leaking verification internals). */
  errorCodes?: string[];
}

/** Whether Turnstile is configured (both site key + secret present). */
export function isTurnstileEnabled(): boolean {
  return SITE_KEY.length > 0 && SECRET_KEY.length > 0;
}

/** The public site key (safe to expose to the browser), or null. */
export function getTurnstileSiteKey(): string | null {
  return SITE_KEY.length > 0 ? SITE_KEY : null;
}

/**
 * Verify a Turnstile token server-side.
 *
 * - Not configured ⇒ bypass (success: true). The app stays usable in dev.
 * - Configured + missing/empty token ⇒ fail (bots that didn't run the widget).
 * - Configured + token ⇒ POST to Cloudflare; trust `success`.
 * - Configured + network error reaching Cloudflare ⇒ fail CLOSED. If you've
 *   enabled Turnstile you want it to work; a verify-side outage is safer to
 *   reject through than to silently let unverified traffic through.
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteip?: string | null,
): Promise<TurnstileVerification> {
  if (!isTurnstileEnabled()) {
    return { success: true, bypass: true };
  }
  if (!token || token.length < MIN_TOKEN_LEN) {
    return { success: false, bypass: false, errorCodes: ["missing-input"] };
  }

  try {
    const form = new URLSearchParams();
    form.set("secret", SECRET_KEY);
    form.set("response", token);
    if (remoteip) form.set("remoteip", remoteip);

    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body: form,
      // Don't hang the submit forever if Cloudflare is slow.
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      return { success: false, bypass: false, errorCodes: [`http-${res.status}`] };
    }
    const data = (await res.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };
    return {
      success: Boolean(data.success),
      bypass: false,
      errorCodes: data["error-codes"],
    };
  } catch {
    // Network/timeout error contacting Cloudflare — fail closed.
    return { success: false, bypass: false, errorCodes: ["verify-unreachable"] };
  }
}

/**
 * Best-effort client IP extraction for the optional `remoteip` siteverify
 * field. Reads the first hop of X-Forwarded-For (set by the gateway), falling
 * back to X-Real-IP. Returns null if no trustworthy header is present.
 */
export function extractClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xrip = req.headers.get("x-real-ip");
  if (xrip) return xrip.trim();
  return null;
}
