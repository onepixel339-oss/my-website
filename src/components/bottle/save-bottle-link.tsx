"use client";

/**
 * SaveBottleLink
 * ---------------------------------------------------------------------------
 * Shown to the author immediately after their bottle is cast (in the drifting
 * confirmation section). The server returned a one-time `private_token` at
 * publish time; this panel turns it into a copyable `/?bottle=<token>` link
 * the author can save to revisit their bottle later — seeing the reactions and
 * quick-word replies left by readers, with no login required.
 *
 * Copy uses the Clipboard API with a graceful fallback. The panel is careful
 * to frame the link as PRIVATE: anyone who has it can view that bottle's
 * reactions, so the author is told to keep it to themselves. There is no
 * account, no second factor — possession of the token IS the authorisation.
 * ---------------------------------------------------------------------------
 */

import { useState } from "react";
import { Link2, Copy, Check, ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n-store";
import { useToast } from "@/hooks/use-toast";

export function SaveBottleLink({ token }: { token: string }) {
  const t = useT();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // Build the link client-side (origin + the bottle query param). Computed on
  // render so it stays correct if the author somehow changes locale / route.
  const href =
    typeof window !== "undefined"
      ? `${window.location.origin}/?bottle=${encodeURIComponent(token)}`
      : `/?bottle=${encodeURIComponent(token)}`;

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(href);
      } else {
        // Legacy fallback for browsers without the async clipboard API.
        const ta = document.createElement("textarea");
        ta.value = href;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      toast({ title: t("save.copied") });
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({ variant: "destructive", title: "Couldn't copy — copy it manually." });
    }
  }

  return (
    <div className="rounded-xl border border-teal-200/80 bg-teal-50/70 p-4">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-700">
          <Link2 className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-teal-900">{t("save.title")}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-teal-800/80">{t("save.body")}</p>

          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code
              className="min-w-0 flex-1 truncate rounded-lg border border-teal-200 bg-background/80 px-2.5 py-1.5 text-xs text-teal-900"
              dir="ltr"
              title={href}
            >
              {href}
            </code>
            <button
              type="button"
              onClick={() => void copy()}
              className="throw-button inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-accent-foreground transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  {t("save.copied")}
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  {t("save.copy")}
                </>
              )}
            </button>
          </div>

          <p className="mt-2 flex items-center gap-1 text-[11px] leading-relaxed text-teal-700/80">
            <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden />
            {t("save.note")}
          </p>
        </div>
      </div>
    </div>
  );
}
