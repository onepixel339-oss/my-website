"use client";

/**
 * BottleReactions
 * ---------------------------------------------------------------------------
 * The lightweight interaction dock shown on a REVEALED bottle, after the note
 * has unrolled. It is the only way a reader can acknowledge someone else's
 * message — there is no chat thread and no ongoing conversation:
 *
 *   1. Three reaction buttons — ❤️ (heart), 🙂 (smile), and "I feel you"
 *      (a custom two-waves-resonating glyph). Tapping one increments the
 *      matching counter on that message in the database
 *      (reactions_heart / reactions_smile / reactions_feel_you). Per spec
 *      there is NO hard duplicate prevention beyond basic per-session
 *      throttling (5s cooldown per session per message per reaction kind,
 *      mirrored client-side here and enforced server-side in
 *      src/lib/reaction-throttle.ts).
 *   2. A single-line "quick word" reply field (max 30 chars). The same PII
 *      filter that guards messages runs server-side before the INSERT — no
 *      links or phone-number-looking patterns. The reply is appended to the
 *      message's `bottleReplies` and is visible ONLY to the original author
 *      via their private token link (GET /api/my-bottle). The reader who
 *      posts it never sees the list of replies — it's a one-shot note into
 *      the author's private reading room.
 *
 * No read receipts, no notifications, no author identity. Fully async and
 * anonymous. Reactions render as lucide Heart/Smile + a custom FeelYouIcon
 * (rather than raw emoji) to stay consistent with the calm, oceanic design
 * system.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useRef, useState } from "react";
import { Heart, Smile, Send, Loader2, Check } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n-store";
import { PiiRejectedBanner } from "@/components/exchange/pii-rejected-banner";
import { FeelYouIcon } from "@/components/bottle/feel-you-icon";
import type { PiiFinding } from "@/lib/pii-filter";

type ReactionKind = "heart" | "smile" | "feel_you";

interface ReactionCounts {
  heart: number;
  smile: number;
  feel_you: number;
}

const MAX_REPLY = 30;
const CLIENT_COOLDOWN_MS = 5000; // mirrors the server-side reaction cooldown

export function BottleReactions({
  bottleId,
  initialCounts,
}: {
  bottleId: string;
  initialCounts: ReactionCounts;
}) {
  const { toast } = useToast();
  const t = useT();
  const reduced = useReducedMotion();

  const [counts, setCounts] = useState<ReactionCounts>(initialCounts);
  // Which reaction is currently showing the "Sent" pulse.
  const [justSent, setJustSent] = useState<ReactionKind | null>(null);
  // Which reactions are in client-side cooldown (disabled).
  const [cooling, setCooling] = useState<Record<ReactionKind, boolean>>({
    heart: false,
    smile: false,
    feel_you: false,
  });

  // Quick-word reply state.
  const [reply, setReply] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pii, setPii] = useState<{ notice: string; findings: PiiFinding[]; content: string } | null>(null);
  const [thanks, setThanks] = useState(false);

  // Track active setTimeout handles so they can be cleared on unmount —
  // prevents setState-on-unmounted if the revealed bottle is dismissed
  // mid-pulse or mid-cooldown.
  const timersRef = useRef<number[]>([]);
  useEffect(() => {
    return () => {
      for (const id of timersRef.current) window.clearTimeout(id);
    };
  }, []);

  async function react(kind: ReactionKind) {
    if (cooling[kind]) return; // ignore taps during cooldown

    // Optimistic: bump immediately, show the "Sent" pulse, start cooldown.
    setCounts((c) => ({ ...c, [kind]: c[kind] + 1 }));
    setJustSent(kind);
    setCooling((c) => ({ ...c, [kind]: true }));
    const pulseTimer = window.setTimeout(() => setJustSent((s) => (s === kind ? null : s)), 1300);
    const cdTimer = window.setTimeout(() => setCooling((c) => ({ ...c, [kind]: false })), CLIENT_COOLDOWN_MS);
    timersRef.current.push(pulseTimer, cdTimer);

    try {
      const res = await fetch(`/api/messages/${encodeURIComponent(bottleId)}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reaction: kind }),
      });
      const data = await res.json();
      if (res.ok && data.status === "ok") {
        // Authoritative counts from the server.
        setCounts(data.counts as ReactionCounts);
        return;
      }
      if (data.status === "rate_limited") {
        // Session-wide 10/hour cap hit — revert the optimistic bump and show
        // the gentle "let the sea settle" message (never a raw error).
        setCounts((c) => ({ ...c, [kind]: Math.max(0, c[kind] - 1) }));
        toast({ title: t("error.rate_limited.reaction") });
        return;
      }
      if (res.status === 429) {
        // Server says too soon — revert the optimistic bump.
        setCounts((c) => ({ ...c, [kind]: Math.max(0, c[kind] - 1) }));
        toast({ title: t("reveal.react.too_soon") });
        return;
      }
      // Any other failure: revert + inform.
      setCounts((c) => ({ ...c, [kind]: Math.max(0, c[kind] - 1) }));
      toast({ variant: "destructive", title: data?.error ?? "Couldn't reach that bottle." });
    } catch {
      setCounts((c) => ({ ...c, [kind]: Math.max(0, c[kind] - 1) }));
      toast({ variant: "destructive", title: "Network error — try again." });
    }
  }

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    const c = reply.trim();
    if (!c) {
      setPii(null);
      toast({ title: t("reveal.reply.empty") });
      return;
    }
    if (c.length > MAX_REPLY) {
      toast({ title: t("reveal.reply.too_long") });
      return;
    }
    setSubmitting(true);
    setPii(null);
    try {
      const res = await fetch(`/api/messages/${encodeURIComponent(bottleId)}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: c }),
      });
      const data = await res.json();
      if (!res.ok && data?.status !== "pii_rejected") {
        if (res.status === 429) {
          toast({ title: t("reveal.reply.too_soon") });
        } else {
          toast({ variant: "destructive", title: data?.error ?? "Couldn't send your word." });
        }
        return;
      }
      if (data.status === "pii_rejected") {
        setPii({
          notice: data.notice as string,
          findings: data.findings as PiiFinding[],
          content: c,
        });
        return;
      }
      // published — the word is on its way to the author's private room.
      setReply("");
      setThanks(true);
      const thanksTimer = window.setTimeout(() => setThanks(false), 4000);
      timersRef.current.push(thanksTimer);
    } catch {
      toast({ variant: "destructive", title: "Network error — try again." });
    } finally {
      setSubmitting(false);
    }
  }

  const reactions: { kind: ReactionKind; label: string; Icon: React.ComponentType<{ className?: string }>; tone: string }[] = [
    { kind: "heart", label: t("reveal.react.heart"), Icon: Heart, tone: "hover:text-rose-500 hover:border-rose-200" },
    { kind: "smile", label: t("reveal.react.smile"), Icon: Smile, tone: "hover:text-amber-500 hover:border-amber-200" },
    { kind: "feel_you", label: t("reveal.react.feel_you"), Icon: FeelYouIcon, tone: "hover:text-teal-600 hover:border-teal-200" },
  ];

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.5, ease: "easeOut" }}
      className="mt-5 border-t border-teal-100/70 pt-4"
    >
      {/* Reaction buttons */}
      <div className="flex flex-col gap-2.5">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {t("reveal.react.label")}
        </span>
        <div className="flex flex-wrap gap-2">
          {reactions.map(({ kind, label, Icon, tone }) => {
            const isCooling = cooling[kind];
            const isJustSent = justSent === kind;
            const count = counts[kind];
            return (
              <button
                key={kind}
                type="button"
                onClick={() => void react(kind)}
                disabled={isCooling}
                aria-label={`${label}: ${count}`}
                className={[
                  "group relative inline-flex min-h-[44px] items-center gap-1.5 rounded-full border bg-background/80 px-3.5 text-sm font-medium text-foreground/80 tabular-nums transition-all duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  tone,
                  isCooling ? "cursor-not-allowed opacity-60" : "hover:-translate-y-0.5 hover:shadow-sm active:scale-95",
                  isJustSent ? "border-teal-300 text-teal-700 shadow-sm" : "border-border/70",
                ].join(" ")}
              >
                <motion.span
                  className="inline-flex"
                  animate={isJustSent && !reduced ? { scale: [1, 1.4, 1] } : { scale: 1 }}
                  transition={isJustSent && !reduced ? { type: "spring", stiffness: 400, damping: 14, duration: 0.5 } : { duration: 0 }}
                  aria-hidden
                >
                  <Icon
                    className={[
                      "h-4 w-4 transition-colors",
                      kind === "heart" && isJustSent ? "text-rose-500" : "",
                      kind === "smile" && isJustSent ? "text-amber-500" : "",
                      kind === "feel_you" && isJustSent ? "text-teal-600" : "",
                    ].join(" ")}
                  />
                </motion.span>
                <span>{count}</span>
                {isJustSent && (
                  <motion.span
                    initial={reduced ? false : { opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    className="ms-0.5 inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-600"
                    aria-hidden
                  >
                    <Check className="h-3 w-3" />
                    {t("reveal.react.sent")}
                  </motion.span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick-word reply */}
      <form onSubmit={submitReply} className="mt-4 space-y-1.5">
        <label htmlFor={`quick-word-${bottleId}`} className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {t("reveal.reply.label")}
        </label>
        <div className="flex items-center gap-2">
          <Input
            id={`quick-word-${bottleId}`}
            value={reply}
            onChange={(e) => {
              setReply(e.target.value);
              if (pii) setPii(null);
            }}
            placeholder={t("reveal.reply.placeholder")}
            maxLength={MAX_REPLY}
            disabled={submitting}
            autoComplete="off"
            className="h-11 rounded-full border-border/70 bg-background/80 text-sm placeholder:text-muted-foreground/70 focus-visible:ring-teal-400"
            aria-describedby={`quick-word-hint-${bottleId}`}
          />
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {reply.length}/{MAX_REPLY}
          </span>
          <button
            type="submit"
            disabled={submitting}
            className="throw-button inline-flex h-11 min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-accent-foreground transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Send className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden />
            )}
            <span className="hidden sm:inline">{t("reveal.reply.cta")}</span>
          </button>
        </div>
        <p id={`quick-word-hint-${bottleId}`} className="text-[11px] text-muted-foreground">
          {thanks ? (
            <span className="inline-flex items-center gap-1 font-medium text-teal-700">
              <Check className="h-3 w-3" aria-hidden />
              {t("reveal.reply.thanks")}
            </span>
          ) : (
            t("reveal.reply.hint")
          )}
        </p>
      </form>

      {pii && (
        <div className="mt-2">
          <PiiRejectedBanner notice={pii.notice} content={pii.content} findings={pii.findings} compact />
        </div>
      )}
    </motion.div>
  );
}
