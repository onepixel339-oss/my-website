"use client";

/**
 * TimeCapsulePicker
 * ---------------------------------------------------------------------------
 * Lets the author optionally schedule their bottle to only enter the shared
 * exchange pool after a delay (24h / 7 days / 1 year) instead of immediately.
 *
 *   - Four options: Now | 24h | 7d | 1y. Rendered as low-chrome pills.
 *   - "Now" is the default (no delay — visible immediately).
 *   - When a delay is chosen, a gentle note appears: "Your bottle is sealed
 *     and stored now, but waits out of the shared pool until its time comes."
 *   - Disabled while the composer is busy (submitting / throwing).
 *   - Fully localised (EN + AR).
 * ---------------------------------------------------------------------------
 */

import { Clock, Hourglass, CalendarDays, CalendarRange, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n-store";

export type CapsuleDelay = "now" | "24h" | "7d" | "1y";

interface Option {
  value: CapsuleDelay;
  icon: React.ComponentType<{ className?: string }>;
  labelKey: "capsule.now" | "capsule.24h" | "capsule.7d" | "capsule.1y";
  hintKey: "capsule.now.hint" | "capsule.24h.hint" | "capsule.7d.hint" | "capsule.1y.hint";
}

const OPTIONS: Option[] = [
  { value: "now", icon: Sparkles, labelKey: "capsule.now", hintKey: "capsule.now.hint" },
  { value: "24h", icon: Clock, labelKey: "capsule.24h", hintKey: "capsule.24h.hint" },
  { value: "7d", icon: CalendarDays, labelKey: "capsule.7d", hintKey: "capsule.7d.hint" },
  { value: "1y", icon: CalendarRange, labelKey: "capsule.1y", hintKey: "capsule.1y.hint" },
];

export function TimeCapsulePicker({
  value,
  onChange,
  disabled,
}: {
  value: CapsuleDelay;
  onChange: (v: CapsuleDelay) => void;
  disabled?: boolean;
}) {
  const t = useT();

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Hourglass className="h-3.5 w-3.5 text-teal-600" aria-hidden />
          {t("capsule.label")}
        </span>
        <span className="text-xs text-muted-foreground">{t("capsule.optional")}</span>
      </div>
      <div
        role="radiogroup"
        aria-label={t("capsule.label")}
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {OPTIONS.map((opt) => {
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
              title={t(opt.hintKey)}
              className={[
                "group flex flex-col items-center justify-center gap-1 rounded-xl border px-2.5 py-2.5 text-xs font-medium transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                "disabled:cursor-not-allowed disabled:opacity-60",
                selected
                  ? "border-teal-400 bg-teal-50/80 text-teal-800 shadow-sm"
                  : "border-border/70 bg-background/60 text-muted-foreground hover:-translate-y-0.5 hover:border-teal-300 hover:text-foreground hover:shadow-sm",
              ].join(" ")}
            >
              <Icon
                className={`h-4 w-4 transition-transform group-hover:scale-110 ${selected ? "text-teal-600" : ""}`}
                aria-hidden
              />
              {t(opt.labelKey)}
            </button>
          );
        })}
      </div>
      {value !== "now" && (
        <p className="rounded-lg border border-teal-100/70 bg-teal-50/50 px-3 py-2 text-xs leading-relaxed text-teal-800/80">
          {t("capsule.note")}
        </p>
      )}
    </div>
  );
}
