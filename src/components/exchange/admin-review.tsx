"use client";

/**
 * AdminReviewDashboard
 * ---------------------------------------------------------------------------
 * Lightweight human-review queue for the moderation pipeline. Lists messages
 * that were NOT auto-published: borderline (pending_review), severe
 * (rejected), and self-harm (self_harm_blocked) cases.
 *
 * This is the audit view, so it surfaces moderation metadata (flag type,
 * confidence, decision log) — but it NEVER shows trigger words, because
 * trigger words are never stored anywhere in the system (by design).
 *
 * Moderator actions:
 *   approve  -> publish a pending_review message (human override)
 *   reject   -> confirm rejection of a pending_review / self_harm item
 *   resolve  -> acknowledge a case without changing distribution
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  Clock,
  LifeBuoy,
  X,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ReviewItemCard, type ReviewItem } from "./review-item-card";

type FilterKey = "all" | "pending_review" | "rejected" | "self_harm_blocked" | "published";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All flagged" },
  { key: "pending_review", label: "Awaiting review" },
  { key: "self_harm_blocked", label: "Self-harm (supported)" },
  { key: "rejected", label: "Rejected" },
  { key: "published", label: "Published" },
];

export function AdminReviewDashboard() {
  const { toast } = useToast();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<FilterKey>("all");
  const [loading, setLoading] = useState(true);
  // Set of item ids with an in-flight moderator action. Using a Set (not a
  // single string) so two concurrent actions on different items can't
  // clobber each other's loading state.
  const [actingIds, setActingIds] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(
    async (f: FilterKey) => {
      setLoading(true);
      try {
        const qs = f === "all" ? "" : `?status=${f}`;
        const res = await fetch(`/api/admin/review${qs}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load review queue");
        const data = (await res.json()) as { items: ReviewItem[]; summary: Record<string, number> };
        setItems(data.items);
        setSummary(data.summary ?? {});
      } catch {
        toast({
          variant: "destructive",
          title: "Couldn't load the review queue",
          description: "Please try again in a moment.",
        });
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  async function act(id: string, action: "approve" | "reject" | "resolve") {
    setActingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/admin/review/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: notes[id] ?? null }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Action failed",
          description: data?.error ?? "Please try again.",
        });
        return;
      }
      toast({
        title: "Done",
        description:
          action === "approve"
            ? "Message published."
            : action === "reject"
              ? "Message kept hidden."
              : "Marked as resolved.",
      });
      setNotes((n) => {
        const next = { ...n };
        delete next[id];
        return next;
      });
      await load(filter);
    } catch {
      toast({ variant: "destructive", title: "Network error" });
    } finally {
      setActingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const totalFlagged =
    (summary["pending_review"] ?? 0) +
    (summary["rejected"] ?? 0) +
    (summary["self_harm_blocked"] ?? 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Awaiting review"
          value={summary["pending_review"] ?? 0}
          icon={<Clock className="h-4 w-4" aria-hidden />}
          tone="amber"
        />
        <SummaryCard
          label="Self-harm (supported)"
          value={summary["self_harm_blocked"] ?? 0}
          icon={<LifeBuoy className="h-4 w-4" aria-hidden />}
          tone="rose"
        />
        <SummaryCard
          label="Rejected"
          value={summary["rejected"] ?? 0}
          icon={<X className="h-4 w-4" aria-hidden />}
          tone="red"
        />
        <SummaryCard
          label="Published"
          value={summary["published"] ?? 0}
          icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
          tone="emerald"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? "default" : "outline"}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {totalFlagged} flagged in total
        </span>
        <Button variant="ghost" size="sm" onClick={() => void load(filter)} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </Button>
      </div>

      {/* Queue */}
      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Loading review queue…
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 p-10 text-center text-muted-foreground">
            <ShieldCheck className="h-8 w-8 opacity-40" aria-hidden />
            <p className="text-sm">Nothing to review here. You&apos;re all caught up.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="max-h-[40rem] space-y-3 overflow-y-auto pr-1">
          {items.map((item) => (
            <ReviewItemCard
              key={item.id}
              item={item}
              acting={actingIds.has(item.id)}
              note={notes[item.id] ?? ""}
              onNoteChange={(v) => setNotes((n) => ({ ...n, [item.id]: v }))}
              onApprove={() => void act(item.id, "approve")}
              onReject={() => void act(item.id, "reject")}
              onResolve={() => void act(item.id, "resolve")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "amber" | "rose" | "red" | "emerald";
}) {
  const tones: Record<string, string> = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
    red: "border-red-200 bg-red-50 text-red-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  return (
    <Card className={tones[tone]}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-medium opacity-80">{label}</span>
        </div>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
