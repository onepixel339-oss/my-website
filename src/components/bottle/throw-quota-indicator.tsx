"use client";

/**
 * ThrowQuotaIndicator
 * ---------------------------------------------------------------------------
 * A gentle "X of N bottles left" pill shown beside the composer. It
 * reframes the rate limit as a feature (encouraging thoughtful writing)
 * rather than a restriction.
 *
 * Rolling token-bucket model:
 *   - Capacity 10, 1 bottle refills every 30 minutes.
 *   - When partially used, shows "Next bottle in ~N min".
 *   - When only 1 remains: "This is your last bottle for now — make it count."
 *   - When 0 remain: "That's all for now — a new one drifts back every 30 min 🌊".
 *   - A subtle progress bar visualises the remaining fraction.
 *   - A live countdown ticks down every minute while the tab is visible.
 *
 *   - Polls GET /api/throw-quota on mount, after each publish (via the
 *     `refreshSignal` prop), and on tab re-focus.
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
  nextRefillMs: number;
}

/** Format a millisecond duration as "~N min" (or "~1 hr" for >= 60 min). */
function formatMinutes(ms: number): number {
  if (ms <= 0) return 0;
  return Math.max(1, Math.round(ms / 60_000));
}

export function ThrowQuotaIndicator({
  refreshSignal,
}: {
  /** Bumped by the parent after a bottle is cast, to re-fetch the quota. */
  refreshSignal: number;
}) {
  const t = useT();
  const [quota, setQuota] = useState<QuotaState | null>(null);
  const [quotaAnchor, setQuotaAnchor] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/throw-quota", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as QuotaState & {
        next_refill_ms?: number;
      };
      setQuota({
        limit: data.limit,
        used: data.used,
        remaining: data.remaining,
        nextRefillMs: data.next_refill_ms ?? 0,
      });
      setQuotaAnchor(Date.now());
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

  // Live countdown: tick the "next bottle in ~N min" hint every minute while
  // the tab is visible and there's a pending refill.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!quota || quota.nextRefillMs <= 0) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [quota]);

  if (!quota) {
    // Skeleton: a faint pill so the layout doesn't jump when it loads.
    return (
      <div className="flex h-7 w-32 items-center rounded-full bg-muted/40 animate-pulse" aria-hidden />
    );
  }

  const { remaining, limit } = quota;

  // Compute the live remaining-ms until next bottle from the fetch anchor.
  // We don't know the exact fetch time, so approximate: count down from the
  // server-reported nextRefillMs minus elapsed since last load.
  const elapsedSinceLoad = Math.max(0, now - quotaAnchor);
  const liveNextRefillMs = Math.max(0, quota.nextRefillMs - elapsedSinceLoad);
  const nextMin = formatMinutes(liveNextRefillMs);
  const showCountdown =
    remaining < limit && remaining > 0 && liveNextRefillMs > 0;

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
      title={
        remaining === 0
          ? t("quota.none")
          : showCountdown
            ? t("quota.next", { min: nextMin })
            : t("quota.refresh")
      }
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
      {/* A tiny inline progress bar — one dot per bottle. */}
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
      {/* Live "next bottle in ~N min" hint — only when partially used. */}
      {showCountdown && (
        <span className="hidden items-center gap-1 sm:flex" aria-hidden>
          <Clock className="h-3 w-3" aria-hidden />
          <span className="tabular-nums opacity-80">
            {t("quota.next", { min: nextMin })}
          </span>
        </span>
      )}
    </div>
  );
}
