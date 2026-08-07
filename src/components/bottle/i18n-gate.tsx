"use client";

/**
 * I18nGate
 * ---------------------------------------------------------------------------
 * Client gate that:
 *   1. Reads the saved locale from localStorage on mount and seeds the store.
 *   2. Reflects the active locale onto <html lang> + <html dir> so the whole
 *      document flips to RTL when Arabic is chosen (and logical Tailwind
 *      properties like ps-/pe-/ms-/me- follow automatically).
 *   3. Suppresses a hydration flash by rendering children immediately while
 *      the dir attribute is patched in a layout effect.
 * -------------------------------------------------------------------------
 */

import { useEffect, useLayoutEffect } from "react";
import {
  applyLocaleToDocument,
  initLocaleFromStorage,
  useI18n,
} from "@/lib/i18n-store";

export function I18nGate({ children }: { children: React.ReactNode }) {
  const locale = useI18n((s) => s.locale);

  // Seed from storage before first paint (layout effect → no flash).
  useLayoutEffect(() => {
    initLocaleFromStorage();
  }, []);

  // Keep <html> in sync whenever the locale changes.
  useEffect(() => {
    applyLocaleToDocument(locale);
  }, [locale]);

  return <>{children}</>;
}
