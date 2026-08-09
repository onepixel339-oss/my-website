"use client";

/**
 * MyBottlesMenu
 * ---------------------------------------------------------------------------
 * A header dropdown that lists the author's own bottles (saved to localStorage
 * at publish time by the composer). Each entry shows a short content preview
 * + a relative timestamp; clicking it navigates to `/?bottle=<token>` which
 * opens the private reading room (MyBottlePanel) showing that bottle's
 * reactions + quick-word replies.
 *
 * WHY THIS EXISTS:
 *   Previously the private revisit token was shown exactly once after a throw
 *   and was never persisted. If the author closed the tab without copying the
 *   link, they lost all access to their own bottle's reactions/replies. This
 *   menu is the recovery path — the author can always find their way back.
 *
 * The button shows a small badge with the count of saved bottles. The menu
 * re-reads localStorage every time it opens (so a bottle thrown in another tab
 * appears immediately). Empty state: a gentle hint to cast a bottle first.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useState } from "react";
import { Mail, ExternalLink, Inbox } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useI18n, useT } from "@/lib/i18n-store";
import {
  listSavedBottles,
  bottleUrl,
  type SavedBottle,
} from "@/lib/bottle-tokens-client";

/** Format a relative time string using the active locale's keys. */
function relativeTime(createdAt: number, t: ReturnType<typeof useT>): string {
  const diffMs = Date.now() - createdAt;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return t("mybottles.just_now");
  if (diffMin < 60) return t("mybottles.min_ago", { n: diffMin });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t("mybottles.h_ago", { n: diffH });
  const diffD = Math.floor(diffH / 24);
  return t("mybottles.d_ago", { n: diffD });
}

export function MyBottlesMenu() {
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const [bottles, setBottles] = useState<SavedBottle[]>([]);
  const [open, setOpen] = useState(false);

  // Re-read localStorage whenever the menu opens (so a bottle thrown in
  // another tab shows up immediately) and on mount.
  useEffect(() => {
    if (!open) return;
    // Reading from localStorage is a sync external source; the setState
    // here mirrors that external state into React. Cascading renders are
    // not a concern (this only runs on menu open / locale change).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBottles(listSavedBottles());
  }, [open, locale]);

  // Also load once on mount so the badge count is correct on first paint
  // (without waiting for the user to open the menu).
  useEffect(() => {
    // Initial hydration of client-only localStorage state into React.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBottles(listSavedBottles());
  }, []);

  // Listen for storage events from other tabs so the badge updates live.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "bottle.tokens.v1") {
        setBottles(listSavedBottles());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const count = bottles.length;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("mybottles.label")}
          title={t("mybottles.label")}
          className={`glass-panel relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-border/60 text-foreground transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8 sm:w-8 sm:min-h-0 sm:min-w-0 ${
            count > 0 ? "text-teal-700" : "text-muted-foreground/60"
          }`}
        >
          <Mail className="h-4 w-4" aria-hidden />
          {count > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-600 px-1 text-[10px] font-bold leading-none text-white shadow-sm sm:right-0 sm:top-0"
              aria-hidden
            >
              {count > 9 ? "9+" : count}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-80 max-w-[calc(100vw-2rem)]"
      >
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{t("mybottles.label")}</span>
          {count > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              {count}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {count === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
            <Inbox className="h-6 w-6 text-muted-foreground/50" aria-hidden />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("mybottles.empty")}
            </p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto py-1">
            {bottles.map((b) => (
              <DropdownMenuItem
                key={b.token}
                asChild
                className="cursor-pointer"
              >
                <a
                  href={bottleUrl(b.token)}
                  className="flex flex-col gap-1 px-2 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 min-w-0 flex-1 text-xs leading-relaxed text-foreground">
                      {b.preview || "—"}
                    </p>
                    <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/60" aria-hidden />
                  </div>
                  <p className="text-[10px] text-muted-foreground/80" dir="ltr">
                    {relativeTime(b.createdAt, t)}
                  </p>
                </a>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
