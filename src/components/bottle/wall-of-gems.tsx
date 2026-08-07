"use client";

/**
 * WallOfGems
 * ---------------------------------------------------------------------------
 * The "Wall of Gems" — a public, fully anonymised showcase of the twenty
 * most-reacted bottles from the last seven days. Refreshed daily on the
 * server (see src/lib/wall-of-gems.ts), so every visitor in the same 24h
 * window sees the same snapshot — there's no per-visitor live updating here
 * (that's what <BottleFeed /> is for). The wall is a quiet weekly digest,
 * not a real-time stream.
 *
 * This component is self-contained: it fetches GET /api/wall-of-gems on
 * mount and on manual refresh, then renders the header (kicker + heading +
 * intro + "refreshed daily" badge + refresh button) and the scrollable list
 * of gem cards. It is meant to be embedded inside a tab by the parent — no
 * outer section wrapper, no global chrome. The parent provides the surface;
 * this component provides the content.
 *
 * Each gem card shows: the message content (whitespace-pre-wrap, break-
 * words), a small row of per-kind reaction counts with icons (Heart, Smile,
 * and the custom FeelYouIcon), the total reactions badge, an optional
 * language badge (via languageLabel()), and a relative time-ago string.
 * Styling follows the app's "dusk over water" identity: teal + amber on
 * glass-panel cards, calm custom scrollbar, gentle staggered entrance that
 * collapses to an instant reveal under prefers-reduced-motion.
 *
 * Authors are NEVER shown — the API returns only the anonymous gem shape
 * (no authorId, no authorHandle, no privateToken, no moderation metadata).
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Gem,
  Heart,
  Smile,
  Globe,
  RefreshCw,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { languageLabel } from "@/lib/language-detect";
import { useI18n, useT } from "@/lib/i18n-store";
import { FeelYouIcon } from "@/components/bottle/feel-you-icon";

/** Anonymous gem shape returned by GET /api/wall-of-gems. */
interface GemEntry {
  id: string;
  content: string;
  category: string | null;
  language: string;
  created_at: string; // ISO 8601
  total_reactions: number;
  hearts: number;
  smiles: number;
  feel_yous: number;
}

interface WallResponse {
  gems: GemEntry[];
  refreshed_at: string; // ISO 8601
}

/**
 * Locale-aware relative time string. Mirrors the helper used in
 * bottle-feed.tsx / received-bottle.tsx so the wall's time-ago reads the
 * same way the rest of the app does (Arabic short form, English short form).
 */
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
  return new Date(iso).toLocaleDateString(rtfLang, {
    month: "short",
    day: "numeric",
  });
}

export function WallOfGems() {
  const { toast } = useToast();
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const reduced = useReducedMotion();

  const [gems, setGems] = useState<GemEntry[]>([]);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/wall-of-gems", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load wall of gems");
      const data = (await res.json()) as WallResponse;
      setGems(data.gems);
      setRefreshedAt(data.refreshed_at);
    } catch {
      setError(true);
      toast({
        variant: "destructive",
        title: "Couldn't gather the gems",
        description: "Please try again in a moment.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      {/* Header — kicker, heading, intro on the left; refreshed badge +
          refresh button on the right. Stays compact on mobile via flex-wrap. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {t("gems.kicker")}
          </p>
          <h2 className="mt-1 flex items-center gap-2 font-display type-h1 font-semibold text-foreground">
            <Gem className="h-5 w-5 text-amber-500" aria-hidden />
            {t("gems.heading")}
          </h2>
          <p className="type-lead mt-1.5 max-w-prose text-muted-foreground">
            {t("gems.intro")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-amber-200 bg-amber-50/60 text-amber-700"
            title={
              refreshedAt
                ? new Date(refreshedAt).toLocaleString(
                    locale === "ar" ? "ar" : undefined,
                  )
                : undefined
            }
          >
            <RefreshCw className="h-3 w-3" aria-hidden />
            {t("gems.refreshed")}
          </Badge>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              aria-hidden
            />
            {t("sea.refresh")}
          </button>
        </div>
      </div>

      {/* Loading skeleton (first load only — subsequent refreshes keep the
          current list visible while the spinner on the button spins). */}
      {loading && gems.length === 0 ? (
        <WallSkeleton />
      ) : error && gems.length === 0 ? (
        <div className="glass-panel flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/40 p-12 text-center">
          <Gem className="h-8 w-8 text-muted-foreground/40" aria-hidden />
          <p className="text-sm text-muted-foreground">{t("gems.empty")}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background/60 px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-teal-300"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {t("sea.refresh")}
          </button>
        </div>
      ) : gems.length === 0 ? (
        <div className="glass-panel flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/40 p-12 text-center text-muted-foreground">
          <Gem className="h-8 w-8 opacity-40" aria-hidden />
          <p className="text-sm">{t("gems.empty")}</p>
        </div>
      ) : (
        <div className="calm-scroll max-h-[40rem] space-y-3 overflow-y-auto pe-1">
          {gems.map((g, i) => (
            <GemCard key={g.id} gem={g} index={i} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}

function GemCard({
  gem,
  index,
  locale,
}: {
  gem: GemEntry;
  index: number;
  locale: string;
}) {
  const t = useT();
  const reduced = useReducedMotion();
  const lang = languageLabel(gem.language);

  return (
    <motion.article
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduced ? 0 : 0.4,
        // Stagger the entrance gently — capped so a full wall of 20 doesn't
        // make the last card wait 1s+ to appear.
        delay: reduced ? 0 : Math.min(index * 0.05, 0.4),
        ease: "easeOut",
      }}
      className="glass-panel rounded-2xl border border-white/40 p-4 shadow-sm transition-transform duration-200 hover:-translate-y-0.5"
    >
      <div className="flex items-start gap-3">
        {/* Tiny gem glyph as an anonymous avatar stand-in. Amber keeps the
            "treasure washed up on the shore" feel distinct from the teal
            <BottleFeed /> cards. */}
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600"
          aria-hidden
        >
          <Gem className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          {/* Meta row: language badge + relative time */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className="border-border bg-background text-muted-foreground"
              title={`Detected language: ${lang}`}
            >
              <Globe className="h-3 w-3" aria-hidden />
              {lang}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {timeAgo(gem.created_at, locale)}
            </span>
          </div>

          {/* The message — anonymous, whitespace preserved. */}
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {gem.content}
          </p>

          {/* Reaction row: per-kind counts (Heart / Smile / FeelYou) on the
              left, total reactions badge pushed to the end. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-rose-200 bg-rose-50/60 text-rose-600 tabular-nums"
            >
              <Heart className="h-3 w-3" aria-hidden />
              {gem.hearts}
            </Badge>
            <Badge
              variant="outline"
              className="border-amber-200 bg-amber-50/60 text-amber-600 tabular-nums"
            >
              <Smile className="h-3 w-3" aria-hidden />
              {gem.smiles}
            </Badge>
            <Badge
              variant="outline"
              className="border-teal-200 bg-teal-50/60 text-teal-600 tabular-nums"
            >
              <FeelYouIcon className="h-3 w-3" />
              {gem.feel_yous}
            </Badge>
            <Badge
              variant="outline"
              className="ms-auto border-amber-300 bg-amber-100/70 text-amber-800 tabular-nums"
            >
              <Sparkles className="h-3 w-3" aria-hidden />
              {t("gems.total_reactions", { n: gem.total_reactions })}
            </Badge>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function WallSkeleton() {
  const t = useT();
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="glass-panel rounded-2xl border border-white/40 p-4"
        >
          <div className="flex items-start gap-3">
            <div className="size-9 rounded-lg bg-muted/70" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-32 rounded bg-muted/70" />
              <div className="h-3 w-full rounded bg-muted/60" />
              <div className="h-3 w-2/3 rounded bg-muted/60" />
            </div>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        {t("sea.loading")}
      </div>
    </div>
  );
}
