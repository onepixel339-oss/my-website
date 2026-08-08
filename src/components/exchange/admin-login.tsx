"use client";

/**
 * AdminLogin
 * ---------------------------------------------------------------------------
 * A small token-gate dialog for the moderation dashboard.
 *
 *   - Rendered (modally) by page.tsx ONLY when the URL carries `?admin=1`
 *     and the visitor is not yet authenticated. This keeps the affordance
 *     invisible to the general public — there is no "Admin" button anywhere
 *     on the normal UI.
 *   - On submit, POSTs the token to /api/admin/session. The server sets an
 *     httpOnly `admin_token` cookie on success (30 days), so every subsequent
 *     /api/admin/* call is authenticated automatically — no client-side
 *     header injection needed.
 *   - On success, calls onAuthenticated() so the parent can re-check the
 *     session and render the AdminReviewDashboard + its tab.
 *   - On 503 (admin not configured in production), shows a disabled message.
 *   - On 401 (wrong token), shows an inline error and lets the user retry.
 * -------------------------------------------------------------------------
 */

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n-store";

interface AdminLoginProps {
  open: boolean;
  onAuthenticated: () => void;
  onClose: () => void;
}

export function AdminLogin({ open, onAuthenticated, onClose }: AdminLoginProps) {
  const t = useT();
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error" | "disabled">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setStatus("submitting");
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      if (res.status === 503) {
        setStatus("disabled");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        return;
      }
      // Success — cookie is set by the server. Notify parent.
      onAuthenticated();
    } catch {
      setStatus("error");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="glass-panel max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-teal-700" aria-hidden />
            {t("admin.login.title")}
          </DialogTitle>
          <DialogDescription>{t("admin.login.body")}</DialogDescription>
        </DialogHeader>

        {status === "disabled" ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {t("admin.login.disabled")}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              type="password"
              autoFocus
              autoComplete="off"
              placeholder={t("admin.login.placeholder")}
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                if (status === "error") setStatus("idle");
              }}
              aria-invalid={status === "error"}
              className="bg-background/70"
            />
            {status === "error" && (
              <p className="text-sm text-destructive">{t("admin.login.error")}</p>
            )}
            <Button type="submit" disabled={status === "submitting" || !token.trim()} className="w-full">
              {status === "submitting" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t("admin.login.submitting")}
                </>
              ) : (
                t("admin.login.cta")
              )}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
