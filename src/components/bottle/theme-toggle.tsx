"use client";

/**
 * ThemeToggle
 * ---------------------------------------------------------------------------
 * A small, calm sun/moon icon button for the header. Sits next to the live
 * bottle counter and the locale toggle.
 *
 *   - Defaults to the user's OS preference (prefers-color-scheme) on first
 *     visit (handled by next-themes `defaultTheme="system"`).
 *   - A manual tap overrides the default AND persists to localStorage
 *     (`theme` key) so the choice is remembered on return visits.
 *   - The icon cross-fades between Sun and Moon (no spin/flip) over ~250ms
 *     so the switch feels gentle, not jarring. The whole-page color cross-
 *     fade is handled in globals.css (280ms on color properties only — no
 *     layout shift).
 *   - Until next-themes has mounted, we render a neutral placeholder with the
 *     same dimensions to prevent layout shift and avoid a hydration mismatch.
 *     IMPORTANT: both the icon AND the aria-label/title are gated on `mounted`,
 *     because next-themes' blocking script resolves `resolvedTheme` from
 *     localStorage synchronously on the client — so the first client render
 *     can already see "dark" while the server render saw `undefined`. Rendering
 *     a directional label before mount would diverge between server and client
 *     and trigger a hydration mismatch on aria-label/title.
 *   - Fully keyboard-accessible: it's a real <button> with an aria-label
 *     that describes the *action* ("Switch to dark mode" / "Switch to light
 *     mode"), and a visible focus ring.
 *
 * The toggle cycles light → dark (and dark → light). We don't expose a
 * separate "system" step in the icon to keep the affordance simple; if the
 * user wants to re-sync to system, clearing localStorage (or the underlying
 * next-themes setTheme("system")) would do it — not needed for the icon.
 * -------------------------------------------------------------------------
 */

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const reduced = useReducedMotion();
  // next-themes resolves the theme on the client only; track mount so we
  // render a stable placeholder (same dimensions) until then — avoids
  // hydration mismatch AND layout shift.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Canonical next-themes mount-gate pattern: resolvedTheme is undefined
    // during SSR + first paint, so we render a stable placeholder until the
    // client mounts. This prevents a hydration mismatch AND layout shift.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";
  // Stable, mount-independent label for SSR + first client paint. next-themes'
  // blocking script resolves `resolvedTheme` from localStorage synchronously
  // on the client, so the first client render can already see "dark" while the
  // server render saw `undefined` — that divergent aria-label/title caused a
  // hydration mismatch. We render a neutral "Toggle theme" label until mounted
  // (same gate already used for the icon), then swap to the directional label.
  const nextLabel = mounted
    ? isDark
      ? "Switch to light mode"
      : "Switch to dark mode"
    : "Toggle theme";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={nextLabel}
      title={nextLabel}
      className="glass-panel inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-border/60 text-foreground transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:h-8 sm:w-8 sm:min-h-0 sm:min-w-0"
    >
      {/* Placeholder until mounted: a neutral Sun outline (same glyph shape
          either way) so there's no content jump. sr-only label still reads
          the action for screen readers. */}
      {!mounted ? (
        <Sun className="h-4 w-4 text-muted-foreground" aria-hidden />
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          {isDark ? (
            <motion.span
              key="moon"
              initial={reduced ? false : { opacity: 0, rotate: -30, scale: 0.7 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={reduced ? undefined : { opacity: 0, rotate: 30, scale: 0.7 }}
              transition={{ duration: reduced ? 0 : 0.25, ease: "easeOut" }}
              className="inline-flex"
            >
              <Moon className="h-4 w-4 text-amber-600" aria-hidden />
            </motion.span>
          ) : (
            <motion.span
              key="sun"
              initial={reduced ? false : { opacity: 0, rotate: 30, scale: 0.7 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={reduced ? undefined : { opacity: 0, rotate: -30, scale: 0.7 }}
              transition={{ duration: reduced ? 0 : 0.25, ease: "easeOut" }}
              className="inline-flex"
            >
              <Sun className="h-4 w-4 text-teal-700" aria-hidden />
            </motion.span>
          )}
        </AnimatePresence>
      )}
    </button>
  );
}
