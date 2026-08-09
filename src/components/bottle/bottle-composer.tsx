"use client";

/**
 * BottleComposer — the WRITE screen
 * ---------------------------------------------------------------------------
 * A private, quiet space to cast an anonymous message into the sea.
 *
 *   - Minimal chrome: a small kicker, a nostalgic display heading, and one
 *     soft-glow textarea as the focal point. Generous whitespace all around.
 *   - Optional tone chips (Advice / Venting / Fun question / Encouragement),
 *     rendered as low-chrome pills that warm on select.
 *   - Live character counter that shifts amber→red near the 500-char cap.
 *   - The throw button is a warm "sunset" pill. On press it scales down and
 *     emits a soft ripple from the exact click point — a satisfying micro-
 *     interaction before the bottle arcs away (handled by the throw overlay).
 *   - Submission hits POST /api/messages/exchange — the reciprocal-unlock
 *     endpoint that stores the message AND atomically returns someone else's.
 *     The received bottle is stashed and revealed after the throw resolves.
 *   - Non-publish outcomes surface inline (PII banner / self-harm support /
 *     hold-for-review / reject). Full Arabic + RTL support via useT().
 * ---------------------------------------------------------------------------
 */

import { useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Send,
  Loader2,
  Lightbulb,
  Wind,
  Sparkles,
  Heart,
  Waves,
  Check,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  BOTTLE_CATEGORIES,
  type BottleCategory,
  type BottleCategoryKey,
} from "@/lib/bottle-categories";
import { useI18n, useT, pluralKey } from "@/lib/i18n-store";
import { type SelfHarmSupportPayload } from "@/components/exchange/self-harm-support";
import { BottleThrowAnimation } from "@/components/bottle/bottle-throw-animation";
import { ReceivedBottle } from "@/components/bottle/received-bottle";
import { SaveBottleLink } from "@/components/bottle/save-bottle-link";
import type { PiiFinding } from "@/lib/pii-filter";
import type { PublicBottle } from "@/components/bottle/types";
import { useTurnstile } from "@/hooks/use-turnstile";
import { ThrowQuotaIndicator } from "@/components/bottle/throw-quota-indicator";
import {
  TimeCapsulePicker,
  type CapsuleDelay,
} from "@/components/bottle/time-capsule-picker";
import {
  LanguagePrefPicker,
  type LanguagePref,
} from "@/components/bottle/language-pref-picker";
import { OutcomeBanner, type SubmitOutcome } from "@/components/bottle/outcome-banner";

// Composer limits (mirrored server-side in /api/messages).
const MAX_CONTENT = 500;
const MIN_CONTENT = 10;
const WARNING_THRESHOLD = Math.round(MAX_CONTENT * 0.9); // 450

// Re-export so existing imports (e.g. the feed) keep working.
export type { PublicBottle };

type Phase = "idle" | "submitting" | "throwing" | "drifting";

const CATEGORY_ICONS: Record<BottleCategoryKey, React.ComponentType<{ className?: string }>> = {
  advice: Lightbulb,
  venting: Wind,
  fun_question: Sparkles,
  encouragement: Heart,
};

/** A transient ripple spawned at a click point on the throw button. */
interface Ripple {
  id: number;
  x: number; // px relative to the button
  y: number;
}

export function BottleComposer({
  onPublished,
}: {
  /** Called after a bottle is published so the feed can refresh. */
  onPublished?: () => void;
}) {
  const { toast } = useToast();
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const reduced = useReducedMotion();
  // Invisible CAPTCHA (Cloudflare Turnstile, env-gated). Inert in dev / this
  // sandbox (no creds); active in production with zero code changes. The
  // container ref is created locally (not in the hook) so the lint rule can
  // verify it's a stable, render-safe ref.
  const captchaContainerRef = useRef<HTMLDivElement | null>(null);
  const captcha = useTurnstile(captchaContainerRef);

  const [content, setContent] = useState("");
  const [category, setCategory] = useState<BottleCategoryKey | null>(null);
  // Time Capsule: optional delay before the bottle enters the shared pool.
  const [capsuleDelay, setCapsuleDelay] = useState<CapsuleDelay>("now");
  // Language preference: "any" (default) or "ar" — sent to the exchange so
  // the server can try to match the received bottle to the preferred language.
  const [languagePref, setLanguagePref] = useState<LanguagePref>("any");
  const [phase, setPhase] = useState<Phase>("idle");
  // Bumped after each publish so the <ThrowQuotaIndicator> re-fetches.
  const [quotaRefresh, setQuotaRefresh] = useState(0);
  const [outcome, setOutcome] = useState<SubmitOutcome | null>(null);
  const [received, setReceived] = useState<PublicBottle | null>(null);
  // The author's private revisit token (returned once by the exchange on
  // publish). Drives the SaveBottleLink panel in the drifting section.
  const [privateToken, setPrivateToken] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  // Stashed while the throw animation plays so the received bottle renders
  // the moment the animation resolves (without a re-fetch).
  const pendingReceived = useRef<PublicBottle | null>(null);
  const pendingPrivateToken = useRef<string | null>(null);
  // Stashed capsule delay so the drift section can show "your bottle drifts
  // in in 7 days" even after the picker has been reset.
  const pendingCapsuleDelay = useRef<CapsuleDelay>("now");
  // Stashed manual-hold notice: when the operator requires admin approval,
  // the author still gets a received bottle, but we surface a small notice
  // in the drift section that their own message is awaiting approval.
  const pendingManualHoldNotice = useRef<string | null>(null);
  const [activeCapsuleDelay, setActiveCapsuleDelay] = useState<CapsuleDelay>("now");
  const [manualHoldNotice, setManualHoldNotice] = useState<string | null>(null);
  const rippleId = useRef(0);
  const throwBtnRef = useRef<HTMLButtonElement | null>(null);

  const trimmedLength = useMemo(() => content.trim().length, [content]);
  const length = content.length;
  const canSubmit = phase === "idle" && trimmedLength >= MIN_CONTENT && length <= MAX_CONTENT;

  const counterTone =
    length >= MAX_CONTENT
      ? "text-red-600"
      : length >= WARNING_THRESHOLD
        ? "text-amber-700"
        : "text-muted-foreground";

  function handleCategoryClick(key: BottleCategoryKey) {
    setCategory((prev) => (prev === key ? null : key));
  }

  /** Spawn a ripple at the click point — the "press" micro-interaction. */
  function spawnRipple(e: React.MouseEvent<HTMLButtonElement>) {
    const btn = throwBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const r: Ripple = {
      id: rippleId.current++,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    setRipples((prev) => [...prev, r]);
    // Clean up after the animation so the array doesn't grow.
    window.setTimeout(() => {
      setRipples((prev) => prev.filter((x) => x.id !== r.id));
    }, 700);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (phase !== "idle") return;

    const trimmed = content.trim();
    if (!trimmed) {
      toast({ variant: "destructive", title: "Write something before casting your bottle." });
      return;
    }
    if (trimmed.length < MIN_CONTENT) {
      toast({
        variant: "destructive",
        title: "A little more?",
        description: `At least ${MIN_CONTENT} characters helps your bottle land.`,
      });
      return;
    }

    setPhase("submitting");
    setOutcome(null);

    try {
      // Invisible CAPTCHA: when Turnstile is configured, obtain a fresh token
      // before submitting. In dev (no creds) this is a no-op returning null.
      let captchaToken: string | null = null;
      if (captcha.enabled) {
        captchaToken = await captcha.ensureToken();
        if (!captchaToken) {
          // Widget still computing or errored — surface the gentle captcha
          // message so the user can retry.
          setOutcome({ kind: "captcha_failed" });
          setPhase("idle");
          return;
        }
      }
      // POST to the reciprocal-unlock exchange: the server stores the
      // message AND atomically returns a random OTHER bottle. There is no
      // separate "read" endpoint — the only way to receive is to give first.
      // The `visible_after_delay` carries the Time Capsule choice; `language`
      // carries the preferred-language filter for the received bottle.
      const res = await fetch("/api/messages/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: trimmed,
          category,
          captcha_token: captchaToken,
          visible_after_delay: capsuleDelay,
          language: languagePref === "ar" ? "ar" : undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok && data?.status !== "pii_rejected") {
        toast({
          variant: "destructive",
          title: "Couldn't cast your bottle",
          description: data?.error ?? "Something went wrong. Please try again.",
        });
        setPhase("idle");
        return;
      }

      switch (data.status) {
        case "published": {
          pendingReceived.current = (data.received as PublicBottle | null) ?? null;
          pendingPrivateToken.current =
            typeof data.private_token === "string" ? data.private_token : null;
          pendingCapsuleDelay.current = capsuleDelay;
          setPhase("throwing");
          onPublished?.();
          // Re-fetch the daily quota so the indicator updates to "4 of 5".
          setQuotaRefresh((n) => n + 1);
          break;
        }
        case "self_harm_blocked": {
          setOutcome({
            kind: "self_harm_blocked",
            support: data.support as SelfHarmSupportPayload,
          });
          setContent("");
          setCategory(null);
          setPhase("idle");
          break;
        }
        case "rejected": {
          setOutcome({ kind: "rejected", notice: data.notice as string });
          setPhase("idle");
          break;
        }
        case "pending_review": {
          // Manual-hold sub-case: the classifier scored the message as clean,
          // but the operator requires admin approval. The author DID receive a
          // bottle in return + a private token — treat it like "published" for
          // the throw animation / received-bottle reveal, but surface a small
          // notice that their own message is awaiting approval.
          if (data.manual_hold === true) {
            pendingReceived.current = (data.received as PublicBottle | null) ?? null;
            pendingPrivateToken.current =
              typeof data.private_token === "string" ? data.private_token : null;
            pendingCapsuleDelay.current = capsuleDelay;
            pendingManualHoldNotice.current =
              typeof data.notice === "string" ? data.notice : null;
            setPhase("throwing");
            onPublished?.();
            setQuotaRefresh((n) => n + 1);
            break;
          }
          // Borderline hold (no received bottle). Just show the notice.
          setOutcome({ kind: "pending_review", notice: data.notice as string });
          setContent("");
          setCategory(null);
          setPhase("idle");
          break;
        }
        case "pii_rejected": {
          setOutcome({
            kind: "pii_rejected",
            notice: data.notice as string,
            findings: data.findings as PiiFinding[],
            content: trimmed,
          });
          setPhase("idle");
          break;
        }
        case "rate_limited": {
          setOutcome({
            kind: "rate_limited",
            retryAfterMs: typeof data.retry_after_ms === "number" ? data.retry_after_ms : undefined,
          });
          // The attempt was consumed even though it was blocked — refresh the
          // quota indicator so it shows the updated remaining count.
          setQuotaRefresh((n) => n + 1);
          setPhase("idle");
          break;
        }
        case "captcha_failed": {
          // Reset the widget so a fresh token is produced for the retry.
          captcha.reset();
          setOutcome({ kind: "captcha_failed" });
          setPhase("idle");
          break;
        }
        case "duplicate": {
          setOutcome({ kind: "duplicate" });
          setPhase("idle");
          break;
        }
        default:
          toast({ variant: "destructive", title: "Unexpected response from the sea." });
          setPhase("idle");
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Network error",
        description: "Please check your connection and try again.",
      });
      setPhase("idle");
    }
  }

  function handleThrowComplete() {
    setReceived(pendingReceived.current);
    setPrivateToken(pendingPrivateToken.current);
    setActiveCapsuleDelay(pendingCapsuleDelay.current);
    setManualHoldNotice(pendingManualHoldNotice.current);
    pendingReceived.current = null;
    pendingPrivateToken.current = null;
    pendingManualHoldNotice.current = null;
    setContent("");
    setCategory(null);
    // Reset the optional pickers so the next bottle starts fresh.
    setCapsuleDelay("now");
    setLanguagePref("any");
    setPhase("drifting");
    window.setTimeout(() => setPhase("idle"), 2600);
  }

  const submitting = phase === "submitting";
  const busy = phase !== "idle";
  const catLabel = (c: BottleCategory) => (locale === "ar" ? c.labelAr : c.label);
  const catHint = (c: BottleCategory) => (locale === "ar" ? c.hintAr : c.hint);

  const hintCopy = (() => {
    if (trimmedLength === 0) return t("write.hint.empty", { min: MIN_CONTENT, max: MAX_CONTENT });
    if (trimmedLength < MIN_CONTENT) {
      const n = MIN_CONTENT - trimmedLength;
      return t(pluralKey("write.hint.short", n), { n });
    }
    return t("write.hint.ok");
  })();

  return (
    <>
      <section
        aria-label={t("write.heading")}
        className="glass-panel relative overflow-hidden rounded-2xl border border-border/50 shadow-[0_30px_80px_-40px_color-mix(in_srgb,var(--ocean-deep)_60%,transparent)]"
      >
        {/* A faint inner top-highlight so the nook feels lit from above.
            Theme-aware: warm white wash in light, soft moonlight in dark. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24"
          style={{
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--moonlight) 55%, transparent), transparent)",
          }}
          aria-hidden
        />

        <form onSubmit={handleSubmit} className="relative space-y-7 p-6 sm:p-9">
          {/* Heading — minimal chrome, nostalgic display serif */}
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-teal-700/80">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-500/70" aria-hidden />
                  {t("write.kicker")}
                </p>
                <h2 className="font-display type-h1 font-semibold text-foreground">
                  {t("write.heading")}
                </h2>
              </div>
              {/* Daily bottle cap indicator — reframes the 5/24h limit as a
                  feature ("2 of 5 bottles left") to encourage thoughtful
                  writing. Polls GET /api/throw-quota; refreshes after publish. */}
              <div className="shrink-0 pt-1">
                <ThrowQuotaIndicator refreshSignal={quotaRefresh} />
              </div>
            </div>
            <p className="type-lead max-w-prose text-muted-foreground">
              {t("write.subhead")}
            </p>
          </div>

          {/* Tone selector — low-chrome pills */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{t("write.tone")}</span>
              <span className="text-xs text-muted-foreground">{t("write.tone.optional")}</span>
            </div>
            <div
              role="radiogroup"
              aria-label={t("write.tone")}
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            >
              {BOTTLE_CATEGORIES.map((cat) => {
                const Icon = CATEGORY_ICONS[cat.key];
                const selected = category === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => handleCategoryClick(cat.key)}
                    disabled={busy}
                    title={catHint(cat)}
                    className={[
                      "group flex items-center justify-center gap-1.5 rounded-xl border px-3 min-h-[44px] text-sm font-medium transition-all duration-200",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      "disabled:cursor-not-allowed disabled:opacity-60",
                      selected
                        ? `${cat.badgeClassName} border-current shadow-sm`
                        : "border-border/70 bg-background/60 text-muted-foreground hover:-translate-y-0.5 hover:border-teal-300 hover:text-foreground hover:shadow-sm",
                    ].join(" ")}
                  >
                    <Icon className="h-4 w-4 transition-transform group-hover:scale-110" aria-hidden />
                    {catLabel(cat)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Language preference + Time Capsule — two optional pickers that
              shape how the bottle is matched and when it enters the pool.
              Side-by-side on desktop, stacked on mobile. */}
          <div className="grid gap-5 sm:grid-cols-2">
            <LanguagePrefPicker
              value={languagePref}
              onChange={setLanguagePref}
              disabled={busy}
            />
            <TimeCapsulePicker
              value={capsuleDelay}
              onChange={setCapsuleDelay}
              disabled={busy}
            />
          </div>

          {/* The soft-glow textarea — the focal point of the nook */}
          <div className="space-y-2.5">
            <label htmlFor="bottle-content" className="sr-only">
              {t("write.heading")}
            </label>
            <Textarea
              id="bottle-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={t("write.placeholder")}
              rows={6}
              maxLength={MAX_CONTENT}
              disabled={busy}
              data-focused={focused ? "true" : undefined}
              className="soft-glow min-h-[10rem] resize-y rounded-xl border-border/60 bg-card/95 p-4 text-base leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:border-transparent sm:text-[1.05rem] sm:leading-[1.75]"
              aria-describedby="bottle-counter bottle-hint"
              aria-invalid={length >= MAX_CONTENT}
            />
            <div className="flex items-center justify-between gap-3 text-xs">
              <span id="bottle-hint" className="text-muted-foreground" aria-live="polite">
                {hintCopy}
              </span>
              <span id="bottle-counter" className={`font-medium tabular-nums ${counterTone}`}>
                {length} / {MAX_CONTENT}
              </span>
            </div>
          </div>

          {/* Throw button — warm sunset pill with a press ripple */}
          <div className="flex justify-end">
            <button
              ref={throwBtnRef}
              type="submit"
              disabled={!canSubmit}
              aria-busy={submitting}
              onMouseDown={spawnRipple}
              onClick={spawnRipple}
              className={[
                "throw-button group relative inline-flex h-12 min-w-[11rem] items-center justify-center gap-2 overflow-hidden rounded-full px-7 text-sm font-semibold text-accent-foreground",
                "transition-[transform,box-shadow] duration-150",
                "hover:brightness-[1.04] active:scale-[0.97]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:brightness-100 disabled:active:scale-100",
              ].join(" ")}
            >
              {/* Ripples — rendered at the click point, animate out via CSS. */}
              {ripples.map((r) => (
                <span
                  key={r.id}
                  className="ripple-dot pointer-events-none absolute block rounded-full bg-white/55"
                  style={{
                    left: r.x,
                    top: r.y,
                    width: 18,
                    height: 18,
                    marginLeft: -9,
                    marginTop: -9,
                  }}
                  aria-hidden
                />
              ))}

              <span className="relative z-10 inline-flex items-center gap-2">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    {t("write.cta.submitting")}
                  </>
                ) : phase === "throwing" ? (
                  <>
                    <Waves className="h-4 w-4" aria-hidden />
                    {t("write.cta.throwing")}
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden />
                    {t("write.cta.idle")}
                  </>
                )}
              </span>
            </button>
          </div>

          {/* Invisible CAPTCHA (Cloudflare Turnstile). Renders nothing
              visible; only mounts a widget when Turnstile is configured via
              env. Zero-size + overflow-hidden so it never affects layout. */}
          <div ref={captchaContainerRef} className="h-0 w-0 overflow-hidden" aria-hidden />
        </form>

        {/* Drifting confirmation + received bottle (after the throw resolves).
            The received bottle is the reciprocal-unlock reward: someone else's
            message, handed back atomically. The save-link panel is the author's
            private way back to their OWN bottle to check reactions later.
            The entrance is a staggered sequence: the drift banner settles first,
            then the save link, then the received bottle reveals — so the eye
            follows a clear path from "your bottle is drifting" → "save it" →
            "here's what came back". Collapses to an instant reveal under
            prefers-reduced-motion. */}
        {phase === "drifting" && (
          <motion.div
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduced ? 0 : 0.3, ease: "easeOut" }}
            className="space-y-4 border-t border-border/50 p-6 sm:p-9"
          >
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced ? 0 : 0.35, delay: reduced ? 0 : 0.05, ease: "easeOut" }}
            >
              <Alert className="border-teal-200 bg-teal-50/80 text-teal-900">
                <Check className="h-4 w-4" aria-hidden />
                <AlertTitle>{t("drift.title")}</AlertTitle>
                <AlertDescription>{t("drift.body")}</AlertDescription>
              </Alert>
            </motion.div>
            {/* Time Capsule confirmation — if the author chose a delay, remind
                them their bottle is sealed but waiting out of the shared pool. */}
            {activeCapsuleDelay !== "now" && (
              <motion.div
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduced ? 0 : 0.35, delay: reduced ? 0 : 0.12, ease: "easeOut" }}
              >
                <Alert className="border-amber-200 bg-amber-50/80 text-amber-900">
                  <Clock className="h-4 w-4" aria-hidden />
                  <AlertTitle>
                    {activeCapsuleDelay === "24h" && t("capsule.24h")}
                    {activeCapsuleDelay === "7d" && t("capsule.7d")}
                    {activeCapsuleDelay === "1y" && t("capsule.1y")}
                  </AlertTitle>
                  <AlertDescription>{t("capsule.note")}</AlertDescription>
                </Alert>
              </motion.div>
            )}
            {/* Manual-approval notice — when the operator requires admin
                approval, the author's own message is held for review even
                though it was clean. Surface a calm heads-up so they know to
                come back later (their bottle is NOT lost). */}
            {manualHoldNotice && (
              <motion.div
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduced ? 0 : 0.35, delay: reduced ? 0 : 0.16, ease: "easeOut" }}
              >
                <Alert className="border-amber-200 bg-amber-50/80 text-amber-900">
                  <Clock className="h-4 w-4" aria-hidden />
                  <AlertTitle>{t("drift.reviewTitle")}</AlertTitle>
                  <AlertDescription>{manualHoldNotice}</AlertDescription>
                </Alert>
              </motion.div>
            )}
            {privateToken && (
              <motion.div
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduced ? 0 : 0.35, delay: reduced ? 0 : 0.2, ease: "easeOut" }}
              >
                <SaveBottleLink token={privateToken} />
              </motion.div>
            )}
            {received && (
              <motion.div
                initial={reduced ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduced ? 0 : 0.45, delay: reduced ? 0 : 0.3, ease: "easeOut" }}
              >
                <ReceivedBottle bottle={received} onDismiss={() => setReceived(null)} />
              </motion.div>
            )}
          </motion.div>
        )}

        {/* A previously-received bottle lingers (with Dismiss) until the author
            clears it or casts again. */}
        {phase === "idle" && received && (
          <div className="space-y-4 border-t border-border/50 p-6 sm:p-9">
            {manualHoldNotice && (
              <Alert className="border-amber-200 bg-amber-50/80 text-amber-900">
                <Clock className="h-4 w-4" aria-hidden />
                <AlertTitle>{t("drift.reviewTitle")}</AlertTitle>
                <AlertDescription>{manualHoldNotice}</AlertDescription>
              </Alert>
            )}
            {privateToken && <SaveBottleLink token={privateToken} />}
            <ReceivedBottle bottle={received} onDismiss={() => setReceived(null)} />
          </div>
        )}

        {/* Moderation / PII outcome banners */}
        {outcome && phase === "idle" && (
          <div className="space-y-2 border-t border-border/50 p-6 sm:p-9">
            <OutcomeBanner outcome={outcome} onDismiss={() => setOutcome(null)} />
          </div>
        )}
      </section>

      {/* Throw animation overlay — only while the bottle is in flight. */}
      {phase === "throwing" && <BottleThrowAnimation onComplete={handleThrowComplete} />}
    </>
  );
}
