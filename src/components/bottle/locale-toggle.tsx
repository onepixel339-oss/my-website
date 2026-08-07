"use client";

/**
 * LocaleToggle
 * ---------------------------------------------------------------------------
 * A minimal, calm pill that flips the UI between English (LTR) and Arabic
 * (RTL). The label always shows the *other* language's name so the affordance
 * is clear in either locale. Applies dir/lang to <html> via the i18n store.
 * -------------------------------------------------------------------------
 */

import { Languages } from "lucide-react";
import { useI18n, useT } from "@/lib/i18n-store";

export function LocaleToggle() {
  const locale = useI18n((s) => s.locale);
  const toggle = useI18n((s) => s.toggle);
  const t = useT();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t("nav.lang.aria")}
      title={t("nav.lang.aria")}
      className="glass-panel inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Languages className="h-3.5 w-3.5 text-teal-700" aria-hidden />
      <span dir="ltr">{t("nav.lang")}</span>
    </button>
  );
}
