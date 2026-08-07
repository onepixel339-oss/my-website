"use client";

/**
 * LiveBottleCounter
 * ---------------------------------------------------------------------------
 * A small header pill that shows "Bottles exchanged today" and updates live.
 *
 *   - Backend: GET /api/stats/today → { count } — published bottles created
 *     since midnight Africa/Cairo (DST-correct), coalesced behind a 3s
 *     server cache. The project runs on SQLite + Prisma (no Supabase /
 *     Postgres / Redis), so per the spec we fall back to polling: the
 *     component polls every 15s (plus once immediately on mount, once on
 *     tab refocus, and once when this browser tab becomes visible again).
 *     15s is the spec'd fallback latency and is plenty "live" for a vanity
 *     counter whose underlying value changes a few times per minute.
 *
 *   - Animation: rather than an instant jump, the number rolls up smoothly
 *     from its previous value to the new one using framer-motion's imperative
 *     `animate(from, to)` with an ease-out curve (~0.9s). Each actual change
 *     also triggers a tiny vertical "roll-in" + scale pop on the digit span
 *     so the update feels alive rather than robotic. `prefers-reduced-motion`
 *     is honoured: the count still updates but without the eased tween.
 *
 *   - A pulsing teal dot labelled "live" signals real-time updates.
 *
 * The pill is fully localised (EN + AR, RTL-aware via logical properties and
 * the document dir) and keyboard-ignored (it's a status, not a control),
 * exposing the full phrase + current number via aria-label / aria-live.
 * -------------------------------------------------------------------------
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, animate } from "framer-motion";
import { useT } from "@/lib/i18n-store";

/** Polling interval (spec'd fallback). */
const POLL_INTERVAL_MS = 15_000;

interface StatsResponse {
  count: number;
}

/** Ease-out cubic-ish curve for a lively but calm count-up. */
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export function LiveBottleCounter() {
  const t = useT();
  // The latest count fetched from the server. `null` until the first poll
  // resolves — the pill renders a muted placeholder meanwhile.
  const [target, setTarget] = useState<number | null>(null);
  // The currently-displayed (animated) integer, driven by framer-motion.
  const [display, setDisplay] = useState(0);
  // The most recent displayed value, held in a ref so the tween always starts
  // from where it currently is (avoids stale-closure jumps).
  const displayRef = useRef(0);
  // Whether the reduced-motion media query matches.
  const [reducedMotion, setReducedMotion] = useState(false);

  // Respect the user's motion preference.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/stats/today", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as StatsResponse;
      if (typeof data.count === "number" && Number.isFinite(data.count)) {
        setTarget((prev) => {
          // Only react to a real change so we don't re-key/re-tween on a
          // no-op poll (the common case — most 15s polls return the same n).
          if (prev !== data.count) return data.count;
          return prev;
        });
      }
    } catch {
      /* network blips are fine — the next tick retries */
    }
  }, []);

  // Initial fetch + interval. Also re-poll when the tab refocuses so a user
  // returning to the tab sees a fresh number immediately rather than waiting
  // up to 15s.
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled) void poll();
    };
    run();
    const id = window.setInterval(run, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [poll]);

  // Drive the count-up tween whenever the target changes. All setState calls
  // happen inside animation callbacks (not synchronously in the effect body)
  // to avoid cascading renders. When the user prefers reduced motion we set
  // duration to 0 so the value snaps; onComplete still guarantees the final
  // integer lands exactly.
  useEffect(() => {
    if (target == null) return;

    const from = displayRef.current;
    const controls = animate(from, target, {
      duration: reducedMotion ? 0 : 0.9,
      ease: EASE_OUT,
      onUpdate: (v) => {
        const r = Math.round(v);
        if (r !== displayRef.current) {
          displayRef.current = r;
          setDisplay(r);
        }
      },
      onComplete: () => {
        if (displayRef.current !== target) {
          displayRef.current = target;
          setDisplay(target);
        }
      },
    });
    return () => controls.stop();
  }, [target, reducedMotion]);

  const loading = target == null;
  const shown = loading ? "—" : display.toLocaleString();
  const ariaLabel = `${t("header.exchanged_today.label")}: ${target != null ? target.toLocaleString() : "—"}`;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      title={t("header.exchanged_today.label")}
      className="live-counter-pill glass-panel inline-flex items-center gap-2 rounded-full border border-border/60 px-3 py-1.5 text-foreground shadow-sm"
    >
      {/* Pulsing "live" dot — teal heartbeat. */}
      <span className="flex items-center gap-1.5 text-teal-600" aria-hidden>
        <span className="live-dot h-2 w-2 rounded-full" />
        <span className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-teal-700/80">
          {t("header.exchanged_today.live")}
        </span>
      </span>

      {/* The number. Keyed by `target` so each new count remounts the span
          and replays the roll-in + scale pop (a subtle vertical nudge that
          reinforces framer-motion's eased count-up). The text itself is driven
          by `display` state, which tweens independently of the remount. */}
      <span className="flex items-baseline gap-1.5">
        <motion.span
          key={target ?? "loading"}
          initial={reducedMotion ? false : { y: "0.32em", opacity: 0, scale: 0.86 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 0.42, ease: EASE_OUT }}
          className="digit-roll inline-block font-display text-base font-semibold tabular-nums leading-none text-foreground sm:text-lg"
        >
          {shown}
        </motion.span>
        <span className="hidden text-[0.62rem] font-medium uppercase tracking-[0.14em] text-muted-foreground sm:inline">
          {t("header.exchanged_today.today")}
        </span>
      </span>
    </div>
  );
}
