"use client";

// ---------------------------------------------------------------------------
// ImpactSummary — a poetic, human-readable aggregate of the bottle's reach.
//
// Instead of showing identity, we show the author (via their private_token
// link) lines like:
//   "Your bottle made someone smile 3 times"
//   "touched 5 hearts"
//   "2 people felt you"
//
// The lines are composed from the three reaction counts using the singular /
// _plural i18n pattern. When there are zero total reactions, we show a gentle
// "still drifting" message instead. Never reveals who reacted — only how many.
// ---------------------------------------------------------------------------

import { Sparkles } from "lucide-react";
import { useT, pluralKey } from "@/lib/i18n-store";

type TFunc = ReturnType<typeof useT>;

export function ImpactSummary({
  hearts,
  smiles,
  feelYous,
  revealCount,
  t,
}: {
  hearts: number;
  smiles: number;
  feelYous: number;
  revealCount: number;
  t: TFunc;
}) {
  const total = hearts + smiles + feelYous;

  // Build a list of poetic phrases for each non-zero reaction type.
  const phrases: string[] = [];
  if (hearts > 0) {
    phrases.push(t(pluralKey("impact.poetic.heart", hearts), { n: hearts }));
  }
  if (smiles > 0) {
    phrases.push(t(pluralKey("impact.poetic.smile", smiles), { n: smiles }));
  }
  if (feelYous > 0) {
    phrases.push(t(pluralKey("impact.poetic.feel_you", feelYous), { n: feelYous }));
  }

  // Empty state: no reactions yet. If the bottle has been revealed at least
  // once, acknowledge that; otherwise the "still drifting" message fits.
  if (total === 0) {
    return (
      <div className="mt-4 rounded-xl border border-teal-100/70 bg-teal-50/40 px-4 py-3.5">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-100/70 text-teal-600" aria-hidden>
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">
              {t("impact.title")}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-foreground/80">
              {t("impact.empty")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Compose the phrases into a single sentence. With one phrase: "touched 5
  // hearts." With two: "touched 5 hearts and made someone smile 3 times." With
  // three: "touched 5 hearts, made someone smile 3 times and 2 people felt
  // you." The join uses the locale-aware "and" connector.
  const and = t("impact.and");
  let sentence: string;
  if (phrases.length === 1) {
    sentence = phrases[0]!;
  } else if (phrases.length === 2) {
    sentence = `${phrases[0]} ${and} ${phrases[1]}`;
  } else {
    sentence = `${phrases.slice(0, -1).join(", ")}, ${and} ${phrases[phrases.length - 1]}`;
  }

  return (
    <div className="mt-4 rounded-xl border border-teal-100/70 bg-gradient-to-br from-teal-50/60 via-cyan-50/30 to-amber-50/30 px-4 py-3.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-100/80 text-teal-600" aria-hidden>
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">
            {t("impact.title")}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">
            {t("impact.some")}{" "}
            <span className="font-medium text-teal-800">{sentence}.</span>
          </p>
          {revealCount > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("reveal.found", { n: revealCount })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
