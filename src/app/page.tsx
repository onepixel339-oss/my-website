"use client";

/**
 * src/app/page.tsx
 * ---------------------------------------------------------------------------
 * Message in a Bottle — the only user-visible route.
 *
 * Visual identity: dusk over water. <OceanBackground /> paints a fixed,
 * calm gradient (deep teal → warm sand) with subtly drifting SVG waves
 * behind everything. The writing nook and feed cards are frosted-glass
 * panels floating over that water.
 *
 * Layout:
 *   - slim, glassy header: app mark + title (nostalgic display serif) +
 *     EN/AR locale toggle
 *   - main content switches on the presence of `?bottle=<token>`:
 *       · token present → <MyBottlePanel /> (the author's private reading
 *         room: their own bottle + aggregate reactions + the quick-word
 *         replies left by readers). No login — possession of the token IS
 *         the authorisation.
 *       · no token → the quiet info banner + Tabs (The Sea / Admin review)
 *   - sticky footer with crisis-resources note
 *
 * The token is read from `window.location.search` on mount (client-only)
 * rather than `useSearchParams` so the page prerenders without a Suspense
 * boundary. "Back to the sea" replaces the URL to drop the token.
 *
 * min-h-screen flex-col + mt-auto footer keeps the footer pinned to the
 * bottom on short pages and pushed down naturally on long ones.
 * -------------------------------------------------------------------------
 */

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Waves, ClipboardCheck, Info, Gem, LogOut, ShieldCheck } from "lucide-react";
import { OceanBackground } from "@/components/bottle/ocean-background";
import { LocaleToggle } from "@/components/bottle/locale-toggle";
import { ThemeToggle } from "@/components/bottle/theme-toggle";
import { LiveBottleCounter } from "@/components/bottle/live-bottle-counter";
import { BottleComposer } from "@/components/bottle/bottle-composer";
import { BottleFeed } from "@/components/bottle/bottle-feed";
import { MyBottlePanel } from "@/components/bottle/my-bottle-panel";
import { MyBottlesMenu } from "@/components/bottle/my-bottles-menu";
import { WallOfGems } from "@/components/bottle/wall-of-gems";
import { AdminReviewDashboard } from "@/components/exchange/admin-review";
import { AdminLogin } from "@/components/exchange/admin-login";
import { useT } from "@/lib/i18n-store";

export default function Home() {
  const t = useT();
  // Bumped after the composer casts a new bottle so the feed refreshes.
  const [refreshSignal, setRefreshSignal] = useState(0);
  // The author's private "my bottle" token, if the URL is `/?bottle=<token>`.
  // Read from window.location on mount (client-only).
  const [bottleToken, setBottleToken] = useState<string | null>(null);
  // Admin session: the moderation tab is only rendered when `isAdmin` is
  // true. The status is fetched from /api/admin/session on mount (and after
  // a successful login). The small shield button in the header opens the
  // login dialog when not yet authenticated; the general public never sees
  // the moderation tab.
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  // Controlled tab state so the admin shield button can programmatically
  // switch to the admin tab after a successful login (and so we can guard
  // against being on a tab that just disappeared, e.g. after logout).
  const [activeTab, setActiveTab] = useState<"sea" | "gems" | "admin">("sea");

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tok = params.get("bottle");
      if (tok && /^[A-Za-z0-9_-]{16,64}$/.test(tok)) {
        // Legitimate external-system sync: the token lives in the browser URL,
        // which is unreadable during SSR/prerender. Reading it on mount and
        // mirroring into React state is the canonical pattern for this; a lazy
        // initializer would cause a hydration mismatch (server renders the
        // normal view, client would render the reading room).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setBottleToken(tok);
      } else if (tok) {
        // Drop a malformed token from the URL so it doesn't linger.
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Check admin session on mount, and open the login dialog if `?admin=1`
  // is present (operator entry point). The dialog is closed automatically
  // when authentication succeeds (see onAuthenticated).
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const params = new URLSearchParams(window.location.search);
        const wantsAdmin = params.get("admin") === "1";
        const res = await fetch("/api/admin/session", { cache: "no-store" });
        const data = (await res.json()) as { admin?: boolean };
        if (cancelled) return;
        if (data.admin) {
          setIsAdmin(true);
        } else if (wantsAdmin) {
          // Not authenticated but the operator asked for the gate → show it.
          setShowAdminLogin(true);
        }
      } catch {
        /* ignore — admin is simply not available */
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  // After a successful login, mark as admin and jump straight to the admin
  // tab so the operator lands in the moderation dashboard. Also drop
  // `?admin=1` from the URL so it doesn't linger.
  function onAdminAuthenticated() {
    setShowAdminLogin(false);
    setIsAdmin(true);
    setActiveTab("admin");
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has("admin")) {
        params.delete("admin");
        const qs = params.toString();
        window.history.replaceState(
          {},
          "",
          qs ? `?${qs}` : window.location.pathname,
        );
      }
    } catch {
      /* ignore */
    }
  }

  async function adminLogout() {
    try {
      await fetch("/api/admin/session", { method: "DELETE" });
    } catch {
      /* ignore */
    }
    setIsAdmin(false);
    // If we were on the admin tab, fall back to the sea so we don't end up
    // on a tab that no longer exists.
    setActiveTab("sea");
  }

  function backToSea() {
    try {
      window.history.replaceState({}, "", window.location.pathname);
    } catch {
      /* ignore */
    }
    setBottleToken(null);
  }

  return (
    <div className="relative flex min-h-screen flex-col text-foreground">
      {/* The calm dusk water — fixed behind everything. */}
      <OceanBackground />

      {/* Header — slim glass bar. */}
      <header className="glass-panel sticky top-0 z-30 border-b border-white/30">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-100/80 text-teal-700 shadow-sm"
              aria-hidden
            >
              <Waves className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 leading-tight">
              <h1 className="font-display truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                {t("app.title")}
              </h1>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                {t("app.subtitle")}
              </p>
            </div>
          </div>
          {/* Right-aligned controls: the live "Bottles exchanged today"
              counter (polls /api/stats/today every 15s, animates the roll)
              grouped with the EN/AR locale toggle and the sun/moon theme
              toggle. shrink-0 so the title is what truncates on narrow
              viewports, never these. */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <LiveBottleCounter />
            {/* The author's saved bottles — a recovery path for the private
                reading room. The token is auto-saved to localStorage on
                every throw, so the author can always find their way back to
                a bottle's reactions + replies even if they lost the one-time
                link. Badge shows the count; empty when none saved yet. */}
            <MyBottlesMenu />
            <LocaleToggle />
            <ThemeToggle />
            {/* Subtle admin entry point — a small shield icon. Visible to
                everyone (so the operator doesn't need to remember a URL),
                but it only opens a token dialog; without the secret the
                moderation tab stays hidden. If already authenticated, the
                click switches to the admin tab directly. */}
            <button
              type="button"
              onClick={() => {
                if (isAdmin) {
                  // Already authenticated — jump straight to the admin tab.
                  setActiveTab("admin");
                } else {
                  // Not authenticated — open the login dialog.
                  setShowAdminLogin(true);
                }
              }}
              aria-label={t("admin.login.title")}
              title={t("admin.login.title")}
              className={`glass-panel inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-border/60 text-foreground transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8 sm:w-8 sm:min-h-0 sm:min-w-0 ${isAdmin ? "text-teal-700" : "text-muted-foreground/60"}`}
            >
              <ShieldCheck className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {bottleToken ? (
          // The author's private reading room — only reachable via the
          // signed token in the URL. Replaces the normal write + feed view
          // so the moment is focused. "Back to the sea" returns.
          <MyBottlePanel token={bottleToken} onBack={backToSea} />
        ) : (
          <>
            {/* Quiet info banner. */}
            <div className="glass-panel mb-6 flex items-start gap-2.5 rounded-xl border border-white/40 p-3.5 text-xs leading-relaxed text-foreground/80">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden />
              <p>
                <span className="font-semibold text-foreground">{t("banner.title")}</span>{" "}
                {t("banner.body")}
              </p>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
              <TabsList className={`glass-panel grid w-full border border-white/30 ${isAdmin ? "grid-cols-3" : "grid-cols-2"}`}>
                <TabsTrigger value="sea" className="gap-1.5">
                  <Waves className="h-4 w-4" aria-hidden />
                  {t("nav.sea")}
                </TabsTrigger>
                <TabsTrigger value="gems" className="gap-1.5">
                  <Gem className="h-4 w-4" aria-hidden />
                  {t("nav.gems")}
                </TabsTrigger>
                {isAdmin && (
                  <TabsTrigger value="admin" className="gap-1.5">
                    <ClipboardCheck className="h-4 w-4" aria-hidden />
                    {t("nav.admin")}
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="sea" className="mt-6 space-y-8">
                {/* The WRITE screen — the hero. Always public: every
                    visitor can cast a bottle and (via the reciprocal-unlock
                    exchange inside the composer) receive one to react to. */}
                <BottleComposer onPublished={() => setRefreshSignal((n) => n + 1)} />
                {/* The public "Bottles in the sea" feed is ADMIN-ONLY. The
                    operator requested that casual visitors not browse the
                    full sea — they can still throw and receive via the
                    composer, but the scrollable feed of everyone's bottles
                    is gated behind the admin session. */}
                {isAdmin && <BottleFeed refreshSignal={refreshSignal} />}
              </TabsContent>

              <TabsContent value="gems" className="mt-6">
                <div className="glass-panel rounded-2xl border border-white/40 p-4 sm:p-6">
                  <WallOfGems />
                </div>
              </TabsContent>

              {/* Admin review panel — DEFENSIVELY gated on `isAdmin` in
                  addition to the tab trigger being hidden. This guarantees
                  the AdminReviewDashboard (and its data-fetching) never
                  mounts for a normal visitor, even if `activeTab` were ever
                  to become "admin" through a future refactor mistake. The
                  tab trigger above is the primary gate; this is the
                  belt-and-braces backstop. */}
              {isAdmin && (
                <TabsContent value="admin" className="mt-6">
                  <div className="glass-panel rounded-2xl border border-white/40 p-4 sm:p-6">
                    <div className="mb-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void adminLogout()}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-accent/20"
                      >
                        <LogOut className="h-3.5 w-3.5" aria-hidden />
                        {t("admin.logout")}
                      </button>
                    </div>
                    <AdminReviewDashboard />
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </>
        )}
      </main>

      {/* Admin login dialog — only opened when the URL carries `?admin=1`
          and the visitor is not yet authenticated. Invisible to the public. */}
      <AdminLogin
        open={showAdminLogin}
        onAuthenticated={onAdminAuthenticated}
        onClose={() => setShowAdminLogin(false)}
      />

      {/* Sticky footer — pinned bottom on short pages, pushed down on long. */}
      <footer className="glass-panel mt-auto border-t border-white/30">
        <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-2 text-xs text-foreground/70 sm:flex-row sm:items-center">
            <p>{t("app.meta")}</p>
            <p className="font-medium text-teal-800">{t("app.crisis")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
