"use client";

/**
 * MyBottlePanel
 * ---------------------------------------------------------------------------
 * The author's private "reading room". Reached ONLY via a signed token in the
 * URL (`/?bottle=<privateToken>`), with no login. The panel fetches
 * GET /api/my-bottle?token=… and shows the author their OWN bottle plus:
 *
 *   - the three aggregate reaction counts (heart / smile / feel-you) left by
 *     readers who had the bottle revealed to them;
 *   - the list of quick-word replies those readers left (fully anonymous —
 *     no author identity, newest-last).
 *
 * There are no read receipts and no notifications; this is a passive,
 * pull-only view. "Back to the sea" clears the token from the URL and returns
 * to the normal write + feed surface.
 *
 * If the token is invalid, points at a moderated-away bottle, or the request
 * fails, the author sees a gentle "this bottle has drifted away" state — never
 * a moderation reason.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Waves, Heart, Smile, ArrowLeft, Loader2, RefreshCw, Wine, Globe, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getBottleCategory } from "@/lib/bottle-categories";
import { languageLabel } from "@/lib/language-detect";
import { useI18n, useT } from "@/lib/i18n-store";
import { FeelYouIcon } from "@/components/bottle/feel-you-icon";
import { ImpactSummary } from "@/components/bottle/impact-summary";
import { forgetBottle } from "@/lib/bottle-tokens-client";

interface MyBottle {
  id: string;
  content: string;
  category: string | null;
  language: string;
  created_at: string;
  reveal_count: number;
  reactions_heart: number;
  reactions_smile: number;
  reactions_feel_you: number;
}

interface BottleReplyRow {
  id: string;
  content: string;
  created_at: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; bottle: MyBottle; replies: BottleReplyRow[] }
  | { kind: "notfound" }
  | { kind: "error" };

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

export function MyBottlePanel({ token, onBack }: { token: string; onBack: () => void }) {
  const { toast } = useToast();
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const reduced = useReducedMotion();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/my-bottle?token=${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      if (res.status === 404) {
        setState({ kind: "notfound" });
        // The bottle has drifted away (deleted / moderated / never existed).
        // Remove the dead token from the saved-bottles list so the "My
        // bottles" menu doesn't keep a link that goes nowhere.
        forgetBottle(token);
        return;
      }
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as { bottle: MyBottle; replies: BottleReplyRow[] };
      setState({ kind: "ok", bottle: data.bottle, replies: data.replies });
    } catch {
      setState({ kind: "error" });
      toast({ variant: "destructive", title: "Couldn't reach your bottle." });
    }
  }, [token, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section aria-label={t("mybottle.title")} className="space-y-4">
      {/* Top bar: back to the sea */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
          {t("mybottle.back")}
        </button>
        {state.kind === "ok" && (
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            {t("sea.refresh")}
          </button>
        )}
      </div>

      {state.kind === "loading" && (
        <div className="glass-panel flex items-center justify-center gap-2 rounded-2xl border border-white/40 p-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t("sea.loading")}
        </div>
      )}

      {state.kind === "notfound" && (
        <div className="glass-panel flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/40 p-12 text-center">
          <Waves className="h-8 w-8 text-muted-foreground/50" aria-hidden />
          <p className="text-sm text-muted-foreground">{t("mybottle.notfound")}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background/60 px-3 py-1.5 text-sm font-medium text-foreground hover:border-teal-300"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {t("mybottle.retry")}
          </button>
        </div>
      )}

      {state.kind === "error" && (
        <div className="glass-panel flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/40 p-12 text-center">
          <p className="text-sm text-muted-foreground">{t("mybottle.error")}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background/60 px-3 py-1.5 text-sm font-medium text-foreground hover:border-teal-300"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {t("mybottle.retry")}
          </button>
        </div>
      )}

      {state.kind === "ok" && (
        <motion.article
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : 0.5, ease: "easeOut" }}
          className="relative overflow-hidden rounded-2xl border border-teal-200/70 bg-gradient-to-br from-teal-50 via-cyan-50/50 to-background shadow-[0_24px_60px_-30px_color-mix(in_srgb,var(--primary)_45%,transparent)]"
        >
          {/* Soft teal wash at the top — the "from the sea" treatment.
              Theme-aware: pale sea-foam in light, glowing teal tint in dark. */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-28"
            style={{ background: "linear-gradient(180deg, var(--reveal-wash), transparent)" }}
            aria-hidden
          />

          <div className="relative p-6 sm:p-7">
            {/* Header */}
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700 shadow-sm" aria-hidden>
                <Wine className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">
                  {t("mybottle.kicker")}
                </p>
                <h2 className="font-display type-h1 font-semibold text-foreground">
                  {t("mybottle.title")}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {t("mybottle.intro")}
                </p>
              </div>
            </div>

            {/* The author's own message on a paper panel */}
            <div className="relative mt-4">
              <div className="rounded-xl border border-amber-100/80 bg-[linear-gradient(180deg,var(--paper-top),var(--paper-bottom))] p-5 shadow-inner">
                <div
                  className="pointer-events-none absolute inset-0 rounded-xl opacity-[0.06]"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(180deg, transparent 0, transparent 27px, var(--paper-rule) 27px, var(--paper-rule) 28px)",
                  }}
                  aria-hidden
                />
                <p className="note-body relative whitespace-pre-wrap break-words type-body-lg text-foreground">
                  {state.bottle.content}
                </p>
              </div>
            </div>

            {/* Badges */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {state.bottle.category &&
                (() => {
                  const cat = getBottleCategory(state.bottle.category);
                  const catLabel = cat ? (locale === "ar" ? cat.labelAr : cat.label) : null;
                  if (!cat || !catLabel) return null;
                  return (
                    <Badge variant="outline" className={cat.badgeClassName}>
                      {catLabel}
                    </Badge>
                  );
                })()}
              <Badge variant="outline" className="border-border bg-background text-muted-foreground">
                <Globe className="h-3 w-3" aria-hidden />
                {languageLabel(state.bottle.language)}
              </Badge>
              <Badge variant="outline" className="border-border bg-background text-muted-foreground">
                {timeAgo(state.bottle.created_at, locale)}
              </Badge>
              {state.bottle.reveal_count > 0 && (
                <Badge variant="outline" className="border-teal-200 bg-teal-50/60 text-teal-700">
                  <Eye className="h-3 w-3" aria-hidden />
                  {t("reveal.found", { n: state.bottle.reveal_count })}
                </Badge>
              )}
            </div>

            {/* Reactions summary */}
            <div className="mt-5 border-t border-teal-100/70 pt-4">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {t("mybottle.reactions")}
              </p>
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                <ReactionStat icon={<Heart className="h-4 w-4" />} label={t("mybottle.heart")} count={state.bottle.reactions_heart} tone="rose" />
                <ReactionStat icon={<Smile className="h-4 w-4" />} label={t("mybottle.smile")} count={state.bottle.reactions_smile} tone="amber" />
                <ReactionStat icon={<FeelYouIcon className="h-4 w-4" />} label={t("reveal.react.feel_you")} count={state.bottle.reactions_feel_you} tone="teal" />
              </div>
            </div>

            {/* Impact indicator (feature 3) — a poetic, aggregate summary of
                the warmth this bottle has received. Never reveals identity;
                only the total counts pulled from the reactions columns. */}
            <ImpactSummary
              hearts={state.bottle.reactions_heart}
              smiles={state.bottle.reactions_smile}
              feelYous={state.bottle.reactions_feel_you}
              revealCount={state.bottle.reveal_count}
              t={t}
            />

            {/* Quick-word replies (private to the author) */}
            <div className="mt-5 border-t border-teal-100/70 pt-4">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {t("mybottle.replies")}
              </p>
              {state.replies.length === 0 ? (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t("mybottle.replies.empty")}
                </p>
              ) : (
                <ul className="calm-scroll mt-2.5 max-h-72 space-y-2 overflow-y-auto pe-1">
                  {state.replies.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-start gap-2 rounded-lg border border-amber-100/70 bg-[linear-gradient(180deg,var(--paper-top),var(--paper-bottom))] px-3 py-2"
                    >
                      <span className="mt-0.5 text-teal-600" aria-hidden>
                        <Waves className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm leading-relaxed text-foreground">{r.content}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(r.created_at, locale)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </motion.article>
      )}
    </section>
  );
}

function ReactionStat({
  icon,
  label,
  count,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  tone: "rose" | "amber" | "teal";
}) {
  const toneClasses =
    tone === "rose"
      ? "border-rose-200 bg-rose-50/60 text-rose-600"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50/60 text-amber-600"
        : "border-teal-200 bg-teal-50/60 text-teal-600";
  return (
    <div className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-3 ${toneClasses}`}>
      <span className="opacity-90" aria-hidden>{icon}</span>
      <span className="text-xl font-semibold tabular-nums text-foreground">{count}</span>
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}
