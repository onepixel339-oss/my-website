"use client";

/**
 * ReceivedBottle — the REVEAL screen
 * ---------------------------------------------------------------------------
 * The card shown after the reciprocal-unlock exchange hands back someone
 * else's message. This is the "reward" half: you gave a message, you got one
 * back. The reveal is choreographed as a small, gentle moment:
 *
 *   1. the card settles in (fade + soft rise)
 *   2. the bottle glyph "uncorks" — a tiny tilt + cork lift
 *   3. the note unrolls top-to-bottom (clip-path wipe, like a scroll opening)
 *   4. the message text + badges fade in over the freshly-opened paper
 *
 * Everything is reduced-motion aware: under prefers-reduced-motion the whole
 * sequence collapses to an instant reveal. Fully anonymous (no author).
 * ---------------------------------------------------------------------------
 */

import { motion, useReducedMotion } from "framer-motion";
import { Globe, Eye, Wine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getBottleCategory } from "@/lib/bottle-categories";
import { languageLabel } from "@/lib/language-detect";
import { useI18n, useT } from "@/lib/i18n-store";
import { BottleReactions } from "@/components/bottle/bottle-reactions";
import type { PublicBottle } from "@/components/bottle/types";

function timeAgo(iso: string, locale: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  const rtfLang = locale === "ar" ? "ar" : undefined;
  if (m < 1) return locale === "ar" ? "الآن" : "just now";
  if (m < 60) return locale === "ar" ? `منذ ${m} د` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return locale === "ar" ? `منذ ${h} س` : `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return locale === "ar" ? `منذ ${d} ي` : `${d}d ago`;
  return new Date(iso).toLocaleDateString(rtfLang, { month: "short", day: "numeric" });
}

export function ReceivedBottle({
  bottle,
  onDismiss,
}: {
  bottle: PublicBottle;
  onDismiss?: () => void;
}) {
  const cat = getBottleCategory(bottle.category);
  const lang = languageLabel(bottle.language);
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const reduced = useReducedMotion();

  const catLabel = cat ? (locale === "ar" ? cat.labelAr : cat.label) : null;

  // Choreography timings. Under reduced motion we collapse the sequence so
  // everything is visible immediately (duration 0, no clip).
  const D = reduced ? 0 : 0.5;
  const unroll = reduced ? 0 : 0.85;

  return (
    <motion.article
      initial={reduced ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: D, ease: "easeOut" }}
      className="relative overflow-hidden rounded-2xl border border-teal-200/70 bg-gradient-to-br from-teal-50 via-cyan-50/50 to-background shadow-[0_24px_60px_-30px_color-mix(in_srgb,var(--primary)_45%,transparent)]"
      aria-label={t("reveal.kicker")}
    >
      {/* A soft teal wash at the top — the "from the sea" treatment.
          Theme-aware: pale sea-foam in light, glowing teal tint in dark. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-28"
        style={{
          background:
            "linear-gradient(180deg, var(--reveal-wash), transparent)",
        }}
        aria-hidden
      />

      <div className="relative p-6 sm:p-7">
        {/* Header row: bottle glyph + kicker + time */}
        <div className="flex items-start gap-3">
          <motion.span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700 shadow-sm"
            initial={reduced ? false : { rotate: -8, scale: 0.85 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ duration: D, delay: reduced ? 0 : 0.15, ease: "easeOut" }}
            aria-hidden
          >
            <Wine className="h-5 w-5" />
          </motion.span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">
                {t("reveal.kicker")}
              </span>
              <span className="text-xs text-muted-foreground">· {timeAgo(bottle.created_at, locale)}</span>
            </div>

            {/* Badges appear after the note opens. */}
            <motion.div
              className="mt-2 flex flex-wrap items-center gap-1.5"
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: D, delay: reduced ? 0 : unroll + 0.55 }}
            >
              {cat && catLabel && (
                <Badge variant="outline" className={cat.badgeClassName}>
                  {catLabel}
                </Badge>
              )}
              <Badge
                variant="outline"
                className="border-border bg-background text-muted-foreground"
                title={`Detected language: ${lang}`}
              >
                <Globe className="h-3 w-3" aria-hidden />
                {lang}
              </Badge>
              {bottle.reveal_count > 1 && (
                <Badge
                  variant="outline"
                  className="border-teal-200 bg-teal-50/60 text-teal-700"
                  title="This bottle has been found this many times"
                >
                  <Eye className="h-3 w-3" aria-hidden />
                  {t("reveal.found", { n: bottle.reveal_count })}
                </Badge>
              )}
            </motion.div>
          </div>
        </div>

        {/* The unrolling note. A paper-coloured panel that wipes open
            top-to-bottom (clip-path inset), then the text fades in on top. */}
        <div className="relative mt-4">
          <motion.div
            className="rounded-xl border border-amber-100/80 bg-[linear-gradient(180deg,var(--paper-top),var(--paper-bottom))] p-5 shadow-inner"
            initial={reduced ? false : { clipPath: "inset(0 0 100% 0)" }}
            animate={{ clipPath: "inset(0 0 0% 0)" }}
            transition={{ duration: unroll, delay: reduced ? 0 : 0.35, ease: "easeInOut" }}
          >
            {/* Faint paper rule lines for the "note" feel. Theme-aware:
                warm brown ink in light, glowing teal in dark. */}
            <div
              className="pointer-events-none absolute inset-0 rounded-xl opacity-[0.06]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(180deg, transparent 0, transparent 27px, var(--paper-rule) 27px, var(--paper-rule) 28px)",
              }}
              aria-hidden
            />

            <motion.p
              className="note-body relative whitespace-pre-wrap break-words type-body-lg text-foreground"
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: D, delay: reduced ? 0 : unroll + 0.5, ease: "easeOut" }}
            >
              {bottle.content}
            </motion.p>
          </motion.div>
        </div>

        {/* The interaction dock — fades in after the note has opened, so the
            "small reward" reveal moment lands before any affordance appears.
            Three reaction buttons + a single-line quick-word reply field.
            Replies are visible only to the original author via their private
            token link; the reader who posts one never sees the list. */}
        <motion.div
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: D, delay: reduced ? 0 : unroll + 0.75 }}
        >
          <BottleReactions
            bottleId={bottle.id}
            initialCounts={{
              heart: bottle.reactions_heart,
              smile: bottle.reactions_smile,
              feel_you: bottle.reactions_feel_you,
            }}
          />
        </motion.div>

        {onDismiss && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onDismiss}
              className="text-sm font-medium text-teal-700 underline-offset-4 transition-colors hover:text-teal-900 hover:underline"
            >
              {t("reveal.dismiss")}
            </button>
          </div>
        )}
      </div>
    </motion.article>
  );
}
