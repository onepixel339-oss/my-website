"use client";

/**
 * LanguagePrefPicker
 * ---------------------------------------------------------------------------
 * Lets the user pick "show me messages in Arabic" vs "any language" before
 * revealing a bottle. The chosen preference is sent to the exchange endpoint
 * as the `language` field, which the server uses to filter the selection pool
 * (with relaxation — if no Arabic bottle is available, it falls back to any).
 *
 *   - Two options: "Any language" | "Arabic". Rendered as a compact toggle.
 *   - "Any language" is the default.
 *   - A small note explains the relaxation behavior.
 *   - Fully localised (EN + AR).
 * ---------------------------------------------------------------------------
 */

import { Globe, Languages } from "lucide-react";
import { useT } from "@/lib/i18n-store";

export type LanguagePref = "any" | "ar";

export function LanguagePrefPicker({
  value,
  onChange,
  disabled,
}: {
  value: LanguagePref;
  onChange: (v: LanguagePref) => void;
  disabled?: boolean;
}) {
  const t = useT();

  const options: { value: LanguagePref; icon: React.ComponentType<{ className?: string }>; labelKey: "langpref.any" | "langpref.ar" }[] = [
    { value: "any", icon: Globe, labelKey: "langpref.any" },
    { value: "ar", icon: Languages, labelKey: "langpref.ar" },
  ];

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Languages className="h-3.5 w-3.5 text-teal-600" aria-hidden />
          {t("langpref.label")}
        </span>
      </div>
      <div
        role="radiogroup"
        aria-label={t("langpref.label")}
        className="inline-flex rounded-xl border border-border/70 bg-background/60 p-0.5"
      >
        {options.map((opt) => {
          const Icon = opt.icon;
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(opt.value)}
              disabled={disabled}
              className={[
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                "disabled:cursor-not-allowed disabled:opacity-60",
                selected
                  ? "bg-teal-100/80 text-teal-800 shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {t(opt.labelKey)}
            </button>
          );
        })}
      </div>
      {value === "ar" && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("langpref.note")}
        </p>
      )}
    </div>
  );
}
