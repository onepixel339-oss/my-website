"use client";

/**
 * OutcomeBanner — the moderation / PII / anti-spam outcome surface
 * ---------------------------------------------------------------------------
 * A 7-branch type-switch rendering different Alerts (or composed cards) for
 * each submission outcome of the reciprocal-unlock exchange:
 *
 *   - published        → rare fallback alert (the throw animation handles it)
 *   - pii_rejected     → delegates to <PiiRejectedBanner/>
 *   - self_harm_blocked→ delegates to <SelfHarmSupportCard/>
 *   - rejected         → amber Alert with the moderator notice
 *   - pending_review   → teal Alert with the hold notice
 *   - rate_limited     → amber Alert + Dismiss (localised)
 *   - captcha_failed   → teal Alert + Dismiss (localised)
 *   - duplicate        → teal Alert + Dismiss (localised)
 *
 * Extracted verbatim from bottle-composer.tsx as part of a move-only refactor
 * (task 5-split-composer). Behaviour, JSX, classNames, and copy are identical
 * to the original inline definition.
 * ---------------------------------------------------------------------------
 */

import {
  ShieldAlert,
  Clock,
  Waves,
  Lightbulb,
  Check,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useT } from "@/lib/i18n-store";
import {
  SelfHarmSupportCard,
  type SelfHarmSupportPayload,
} from "@/components/exchange/self-harm-support";
import { PiiRejectedBanner } from "@/components/exchange/pii-rejected-banner";
import type { PiiFinding } from "@/lib/pii-filter";

/**
 * The discriminated union of every submission outcome the exchange can
 * return. Defined here (rather than in bottle-composer.tsx) so that both
 * BottleComposer (which produces outcomes) and OutcomeBanner (which renders
 * them) can import it from one place without a circular dependency.
 */
export type SubmitOutcome =
  | { kind: "published" }
  | { kind: "self_harm_blocked"; support: SelfHarmSupportPayload }
  | { kind: "rejected"; notice: string }
  | { kind: "pending_review"; notice: string }
  | { kind: "pii_rejected"; notice: string; findings: PiiFinding[]; content: string }
  // --- anti-spam / rate-limit gentle outcomes ---------------------------
  | { kind: "rate_limited"; retryAfterMs?: number }
  | { kind: "captcha_failed" }
  | { kind: "duplicate" };

export function OutcomeBanner({
  outcome,
  onDismiss,
}: {
  outcome: SubmitOutcome;
  onDismiss: () => void;
}) {
  // Hooks must run unconditionally, before any early return.
  const t = useT();

  if (outcome.kind === "self_harm_blocked") {
    return (
      <div className="space-y-2">
        <SelfHarmSupportCard support={outcome.support} />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  if (outcome.kind === "pii_rejected") {
    return (
      <div className="space-y-2">
        <PiiRejectedBanner
          notice={outcome.notice}
          content={outcome.content}
          findings={outcome.findings}
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  if (outcome.kind === "rejected") {
    return (
      <Alert className="border-amber-200 bg-amber-50 text-amber-900">
        <ShieldAlert className="h-4 w-4" aria-hidden />
        <AlertTitle>Message not published</AlertTitle>
        <AlertDescription>{outcome.notice}</AlertDescription>
      </Alert>
    );
  }

  if (outcome.kind === "pending_review") {
    return (
      <Alert className="border-teal-200 bg-teal-50 text-teal-900">
        <Clock className="h-4 w-4" aria-hidden />
        <AlertTitle>Held for a quick review</AlertTitle>
        <AlertDescription>{outcome.notice}</AlertDescription>
      </Alert>
    );
  }

  // --- Gentle anti-spam / rate-limit outcomes ---------------------------
  // These use localised copy and a Dismiss control so the author can clear
  // the message and try again (with a different thought, or tomorrow).
  if (outcome.kind === "rate_limited") {
    return (
      <div className="space-y-2">
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <Waves className="h-4 w-4" aria-hidden />
          <AlertTitle>{t("error.rate_limited.throw.title")}</AlertTitle>
          <AlertDescription>{t("error.rate_limited.throw.body")}</AlertDescription>
        </Alert>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }
  if (outcome.kind === "captcha_failed") {
    return (
      <div className="space-y-2">
        <Alert className="border-teal-200 bg-teal-50 text-teal-900">
          <ShieldAlert className="h-4 w-4" aria-hidden />
          <AlertTitle>{t("error.captcha.title")}</AlertTitle>
          <AlertDescription>{t("error.captcha.body")}</AlertDescription>
        </Alert>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }
  if (outcome.kind === "duplicate") {
    return (
      <div className="space-y-2">
        <Alert className="border-teal-200 bg-teal-50 text-teal-900">
          <Lightbulb className="h-4 w-4" aria-hidden />
          <AlertTitle>{t("error.duplicate.title")}</AlertTitle>
          <AlertDescription>{t("error.duplicate.body")}</AlertDescription>
        </Alert>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  // published (rarely shown here — the throw animation handles it)
  return (
    <Alert className="border-teal-200 bg-teal-50 text-teal-900">
      <Check className="h-4 w-4" aria-hidden />
      <AlertTitle>Cast</AlertTitle>
      <AlertDescription>Your bottle is now floating in the feed.</AlertDescription>
    </Alert>
  );
}
