"use client";

/**
 * ThemeProvider
 * ---------------------------------------------------------------------------
 * Wraps next-themes' <ThemeProvider> with this app's preferred config:
 *
 *   - attribute="class"  → toggles the `.dark` class on <html>, which is what
 *                          the shadcn `@custom-variant dark` and our CSS
 *                          `.dark { … }` block both key off.
 *   - defaultTheme="system"
 *   - enableSystem       → first-time visitors get their OS preference
 *                          (prefers-color-scheme) with no localStorage entry.
 *   - disableTransitionOnChange=false
 *                          We DO want the 280ms cross-fade defined in
 *                          globals.css; next-themes only suppresses the
 *                          transition when this is true.
 *
 * next-themes injects a blocking <script> before paint that reads
 * localStorage (`theme` key) and applies the class synchronously, so there
 * is no FOUC and no hydration mismatch. <html suppressHydrationWarning> (set
 * in layout.tsx) silences the expected className diff between server render
 * (no class) and client first paint (class applied).
 *
 * Persistence: next-themes writes the resolved theme ("light" | "dark") to
 * localStorage under the `theme` key on every manual change. On return
 * visits it reads that key; if absent, it falls back to the system
 * preference — exactly the "remember the manual choice, respect system for
 * first-timers" behavior requested.
 * -------------------------------------------------------------------------
 */

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
      storageKey="theme"
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
