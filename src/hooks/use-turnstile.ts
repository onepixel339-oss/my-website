"use client";

/**
 * useTurnstile
 * ---------------------------------------------------------------------------
 * Invisible Cloudflare Turnstile hook for the bottle submit action.
 *
 *   - On mount, fetches GET /api/turnstile/config. When Turnstile is NOT
 *     configured (no env vars — e.g. local dev, this sandbox), the hook is
 *     inert: `enabled` stays false, no script loads, no widget renders, and
 *     `ensureToken()` returns null. The app works normally without captcha.
 *   - When configured, it loads the Turnstile script, renders an invisible
 *     widget (`appearance: "execute"`) into `containerRef`, and captures the
 *     token via the widget callback. `ensureToken()` returns the current
 *     token (triggering `execute()` if needed and waiting briefly). `reset()`
 *     refreshes the widget for a retry after a failed verification.
 *
 * Token state is kept in a ref (not React state) so `ensureToken`'s polling
 * loop reads the live value without stale-closure issues — and so token
 * churn doesn't trigger re-renders of the composer.
 * -------------------------------------------------------------------------
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface TurnstileConfig {
  enabled: boolean;
  siteKey: string | null;
}

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: Record<string, unknown>,
  ) => string;
  reset: (id?: string) => void;
  execute: (id?: string) => void;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    onloadTurnstileCallback?: () => void;
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onloadTurnstileCallback";

export interface UseTurnstile {
  /** True when Turnstile is configured and the widget is active. */
  enabled: boolean;
  /**
   * Resolve with a fresh token (or null on timeout). A no-op returning null
   * when Turnstile isn't configured.
   */
  ensureToken: (timeoutMs?: number) => Promise<string | null>;
  /** Reset the widget so a fresh token is produced for the next attempt. */
  reset: () => void;
}

export function useTurnstile(
  containerRef: React.RefObject<HTMLDivElement | null>,
): UseTurnstile {
  const [enabled, setEnabled] = useState(false);
  const widgetIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const scriptPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Load the Turnstile script once (idempotent via the shared promise ref).
    function loadScript(): Promise<void> {
      if (scriptPromiseRef.current) return scriptPromiseRef.current;
      scriptPromiseRef.current = new Promise<void>((resolve) => {
        window.onloadTurnstileCallback = () => resolve();
        const s = document.createElement("script");
        s.src = SCRIPT_SRC;
        s.async = true;
        s.defer = true;
        document.head.appendChild(s);
      });
      return scriptPromiseRef.current;
    }

    // Render the invisible widget into the container ref.
    function renderWidget(siteKey: string): void {
      const el = containerRef.current;
      if (!el || !window.turnstile) return;
      try {
        if (widgetIdRef.current) window.turnstile.remove(widgetIdRef.current);
      } catch {
        /* ignore */
      }
      widgetIdRef.current = window.turnstile.render(el, {
        sitekey: siteKey,
        appearance: "execute",
        callback: (t: string) => {
          tokenRef.current = t;
        },
        "expired-callback": () => {
          tokenRef.current = null;
        },
        "error-callback": () => {
          tokenRef.current = null;
        },
      });
    }

    (async () => {
      try {
        const res = await fetch("/api/turnstile/config", { cache: "no-store" });
        const cfg = (await res.json()) as TurnstileConfig;
        if (cancelled || !cfg.enabled || !cfg.siteKey) return;
        setEnabled(true);
        await loadScript();
        if (cancelled) return;
        renderWidget(cfg.siteKey);
      } catch {
        /* captcha is optional — fail silently */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [containerRef]);

  const ensureToken = useCallback(
    async (timeoutMs = 6000): Promise<string | null> => {
      if (!enabled) return null;
      if (tokenRef.current) return tokenRef.current;
      const ts = window.turnstile;
      if (widgetIdRef.current && ts) {
        try {
          ts.execute(widgetIdRef.current);
        } catch {
          /* ignore */
        }
      }
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        await new Promise((r) => setTimeout(r, 200));
        if (tokenRef.current) return tokenRef.current;
      }
      return null;
    },
    [enabled],
  );

  const reset = useCallback(() => {
    tokenRef.current = null;
    const ts = window.turnstile;
    if (widgetIdRef.current && ts) {
      try {
        ts.reset(widgetIdRef.current);
      } catch {
        /* ignore */
      }
    }
  }, []);

  return { enabled, ensureToken, reset };
}
