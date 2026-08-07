/**
 * src/lib/bottle-categories.ts
 * ---------------------------------------------------------------------------
 * Shared definition of the optional "tone" categories a bottle author can
 * pick before casting their message. Used by:
 *   - the bottle composer (renders the chips)
 *   - POST /api/messages (validates the incoming category)
 *   - the bottle feed (renders a per-bottle badge)
 *
 * Categories are intentionally optional — an author can skip the selector
 * and cast an uncategorised bottle. The stored value is the stable `key`
 * (advice | venting | fun_question | encouragement), never the display
 * label, so labels can be reworded without a migration.
 * ---------------------------------------------------------------------------
 */

export type BottleCategoryKey =
  | "advice"
  | "venting"
  | "fun_question"
  | "encouragement";

export interface BottleCategory {
  key: BottleCategoryKey;
  label: string;
  /** Arabic label (shown when the UI locale is ar). */
  labelAr: string;
  /** Short helper shown under the chip / as a tooltip. */
  hint: string;
  /** Arabic helper. */
  hintAr: string;
  /** Lucide icon name token — resolved in the component layer. */
  icon: "lightbulb" | "wind" | "sparkles" | "heart";
  /** Tailwind classes for the badge tone (kept teal/sand/rose to avoid blue/indigo). */
  badgeClassName: string;
}

export const BOTTLE_CATEGORIES: BottleCategory[] = [
  {
    key: "advice",
    label: "Advice",
    labelAr: "نصيحة",
    hint: "Share something you wish you'd known sooner.",
    hintAr: "شارك ما تمنيت لو عرفته مبكرًا.",
    icon: "lightbulb",
    badgeClassName: "border-teal-200 bg-teal-50 text-teal-800",
  },
  {
    key: "venting",
    label: "Venting",
    labelAr: "تفريغ",
    hint: "Let something off your chest, honestly.",
    hintAr: "أفرغ ما في صدرك بصدق.",
    icon: "wind",
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-800",
  },
  {
    key: "fun_question",
    label: "Fun question",
    labelAr: "سؤال ممتع",
    hint: "Ask something light and curious.",
    hintAr: "اطرح سؤالًا خفيفًا وفضوليًا.",
    icon: "sparkles",
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  {
    key: "encouragement",
    label: "Encouragement",
    labelAr: "تشجيع",
    hint: "A kind word for whoever finds this bottle.",
    hintAr: "كلمة طيبة لمن يجد هذه الزجاجة.",
    icon: "heart",
    badgeClassName: "border-rose-200 bg-rose-50 text-rose-800",
  },
];

/** Parse + validate an incoming category value. Returns null when absent/invalid. */
export function parseBottleCategory(raw: unknown): BottleCategoryKey | null {
  if (typeof raw !== "string") return null;
  if (raw === "") return null;
  return BOTTLE_CATEGORIES.some((c) => c.key === raw) ? (raw as BottleCategoryKey) : null;
}

/** Look up the display metadata for a stored category key. */
export function getBottleCategory(key: string | null | undefined): BottleCategory | null {
  if (!key) return null;
  return BOTTLE_CATEGORIES.find((c) => c.key === key) ?? null;
}
