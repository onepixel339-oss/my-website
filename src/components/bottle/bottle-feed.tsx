"use client";

/**
 * BottleFeed
 * ---------------------------------------------------------------------------
 * The "sea" — an anonymous, scrollable feed of published bottles
 * (GET /api/messages). Each bottle shows its content, an optional tone
 * badge, a small detected-language tag, and how long ago it was cast.
 * Authors are never shown: bottles are anonymous to readers by design.
 *
 * Restyled to the dusk-over-water identity: teal-tinted glass cards floating
 * over the ocean background, with a calm custom scrollbar. Refetches when
 * `refreshSignal` changes.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from "react";
import { Waves, RefreshCw, Loader2, Globe, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { getBottleCategory } from "@/lib/bottle-categories";
import { languageLabel } from "@/lib/language-detect";
import { useI18n, useT } from "@/lib/i18n-store";
import type { PublicBottle } from "@/components/bottle/types";

function timeAgo(iso: string, locale: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return locale === "ar" ? "الآن" : "just now";
  if (m < 60) return locale === "ar" ? `منذ ${m} د` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return locale === "ar" ? `منذ ${h} س` : `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return locale === "ar" ? `منذ ${d} ي` : `${d}d ago`;
  return new Date(iso).toLocaleDateString(locale === "ar" ? "ar" : undefined, {
    month: "short",
    day: "numeric",
  });
}

export function BottleFeed({ refreshSignal }: { refreshSignal: number }) {
  const { toast } = useToast();
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const [bottles, setBottles] = useState<PublicBottle[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/messages", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load bottles");
      const data = (await res.json()) as { messages: PublicBottle[] };
      setBottles(data.messages);
    } catch {
      toast({
        variant: "destructive",
        title: "Couldn't load bottles",
        description: "Please try again in a moment.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Waves className="h-4 w-4 text-teal-600" aria-hidden />
          {t("sea.heading")}
          {!loading && bottles.length > 0 && (
            <Badge variant="secondary" className="ml-1 tabular-nums">
              {bottles.length}
            </Badge>
          )}
        </h2>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          {t("sea.refresh")}
        </button>
      </div>

      {loading && bottles.length === 0 ? (
        <FeedSkeleton />
      ) : bottles.length === 0 ? (
        <div className="glass-panel flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/40 p-10 text-center text-muted-foreground">
          <Waves className="h-8 w-8 opacity-40" aria-hidden />
          <p className="text-sm">{t("sea.empty")}</p>
        </div>
      ) : (
        <div className="calm-scroll max-h-[34rem] space-y-3 overflow-y-auto pe-1">
          {bottles.map((b) => (
            <BottleCard key={b.id} bottle={b} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}

function BottleCard({
  bottle,
  locale,
}: {
  bottle: PublicBottle;
  locale: string;
}) {
  const cat = getBottleCategory(bottle.category);
  const lang = languageLabel(bottle.language);
  const catLabel = cat ? (locale === "ar" ? cat.labelAr : cat.label) : null;

  return (
    <article className="glass-panel rounded-2xl border border-white/40 p-4 shadow-sm transition-transform duration-200 hover:-translate-y-0.5">
      <div className="flex items-start gap-3">
        {/* Tiny bottle glyph as an anonymous avatar stand-in. */}
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-700"
          aria-hidden
        >
          <Waves className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
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
            <span className="text-xs text-muted-foreground">{timeAgo(bottle.created_at, locale)}</span>
          </div>

          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {bottle.content}
          </p>

          {bottle.reveal_count > 0 && (
            <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <Eye className="h-3 w-3" aria-hidden />
              {locale === "ar"
                ? `فُتحت ${bottle.reveal_count} ${bottle.reveal_count === 1 ? "مرة" : "مرات"}`
                : `Opened ${bottle.reveal_count} ${bottle.reveal_count === 1 ? "time" : "times"}`}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="glass-panel rounded-2xl border border-white/40 p-4">
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
        Gathering bottles…
      </div>
    </div>
  );
}
