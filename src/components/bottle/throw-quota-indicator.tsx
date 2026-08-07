"use client";

/**
 * ThrowQuotaIndicator
 * ---------------------------------------------------------------------------
 * A gentle "X of 5 bottles left today" pill shown beside the composer. It
 * reframes the 5/24h rate limit as a feature (encouraging thoughtful writing)
 * rather than a restriction.
 *
 *   - Polls GET /api/throw-quota on mount and after each publish (via the
 *     `refreshSignal` prop, bumped by the parent when a bottle is cast).
 *   - Shows a warm amber dot + "2 of 5 bottles left".
 *   - When only 1 remains: "This is your last bottle today — make it count."
 *   - When 0 remain: "That's all for today — come back tomorrow 🌊".
 *   - A subtle progress bar visualises the remaining fraction.
 *   - Fully localised (EN + AR). The pill stays low-chrome so it never
 *     competes with the writing nook.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from "react";
import { Wine, Clock } from "lucide-react";
import { useT } from "@/lib/i18n-store";

interface QuotaState {
  limit: number;
  used: number;
  remaining: number;
}

export function ThrowQuotaIndicator({
  refreshSignal,
}: {
  /** Bumped by the parent after a bottle is cast, to re-fetch the quota. */
  refreshSignal: number;
}) {
  const t = useT();
  const [quota, setQuota] = useState<QuotaState | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/throw-quota", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as QuotaState;
      setQuota({
        limit: data.limit,
        used: data.used,
        remaining: data.remaining,
      });
    } catch {
      /* silent — the pill is decorative, not critical */
    }
  }, []);

  useEffect(() => {
    // Fetching server state into the component is the canonical use of an
    // effect here; the setState calls happen asynchronously after the fetch
    // resolves, not synchronously within the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, refreshSignal]);

  // Re-fetch when the tab refocuses — if the first poll failed (network blip)
  // the skeleton would otherwise stay forever until the next publish. This
  // gives the pill a recovery path on tab re-focus.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [load]);

  if (!quota) {
    // Skeleton: a faint pill so the layout doesn't jump when it loads.
    return (
      <div className="flex h-7 w-32 items-center rounded-full bg-muted/40 animate-pulse" aria-hidden />
    );
  }

  const { remaining, limit } = quota;
  const fraction = limit > 0 ? remaining / limit : 0;

  // Tone shifts from teal (plenty) → amber (last) → rose (none).
  const tone =
    remaining === 0
      ? "border-rose-200 bg-rose-50/70 text-rose-700"
      : remaining <= 1
        ? "border-amber-200 bg-amber-50/70 text-amber-800"
        : "border-teal-200 bg-teal-50/70 text-teal-800";

  const dotColor =
    remaining === 0
      ? "bg-rose-400"
      : remaining <= 1
        ? "bg-amber-400"
        : "bg-teal-400";

  // Accessible label for the whole pill.
  const ariaLabel =
    remaining === 0
      ? t("quota.none")
      : t("quota.remaining", { left: remaining, limit });

  return (
    <div
      role="status"
      aria-label={ariaLabel}
      title={t("quota.refresh")}
      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${tone}`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor}`} aria-hidden />
      {remaining === 0 ? (
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" aria-hidden />
          <span className="hidden sm:inline">{t("quota.none")}</span>
          <span className="sm:hidden">0/{limit}</span>
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          <Wine className="h-3 w-3" aria-hidden />
          <span className="tabular-nums">
            {t("quota.remaining", { left: remaining, limit })}
          </span>
        </span>
      )}
      {/* A tiny inline progress bar — 5 segments, one per bottle. */}
      <span className="flex items-center gap-0.5" aria-hidden>
        {Array.from({ length: limit }, (_, i) => (
          <span
            key={i}
            className={`h-1 w-1 rounded-full ${
              i < remaining
                ? remaining <= 1
                  ? "bg-amber-400"
                  : "bg-teal-400"
                : "bg-current opacity-20"
            }`}
          />
        ))}
      </span>
    </div>
  );
}
