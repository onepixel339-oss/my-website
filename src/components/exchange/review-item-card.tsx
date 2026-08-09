"use client";

/**
 * ReviewItemCard
 * ---------------------------------------------------------------------------
 * Card that renders a single flagged message in the admin review queue:
 * author + content, moderation metadata (flag type, confidence, decision
 * audit log), and the approve / reject / resolve action buttons.
 *
 * Extracted from admin-review.tsx as part of a code-quality pass —
 * behavior is unchanged. Helper functions (flagLabel, statusLabel,
 * decisionLabel, timeAgo, initials) live here because they are only used
 * by this card.
 * ---------------------------------------------------------------------------
 */

import {
  ShieldAlert,
  LifeBuoy,
  Check,
  Clock,
  X,
  Loader2,
  ScrollText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export interface ReviewLog {
  id: string;
  flagType: string;
  confidence: number;
  decision: string;
  modelVersion: string | null;
  createdAt: string;
}

export interface ReviewItem {
  id: string;
  authorHandle: string;
  authorId: string;
  content: string;
  isHidden: boolean;
  moderationStatus: string;
  moderationFlagType: string | null;
  moderationConfidence: number | null;
  createdAt: string;
  publishedAt: string | null;
  adminResolvedAt: string | null;
  adminNote: string | null;
  logs: ReviewLog[];
}

function flagLabel(flag: string | null): { label: string; className: string } {
  switch (flag) {
    case "self_harm":
      return { label: "Self-harm risk", className: "bg-rose-100 text-rose-800 border-rose-200" };
    case "hate_speech":
      return { label: "Hate speech", className: "bg-red-100 text-red-800 border-red-200" };
    case "harassment":
      return { label: "Harassment", className: "bg-orange-100 text-orange-800 border-orange-200" };
    case "sexual_minors":
      return { label: "CSAM risk", className: "bg-red-100 text-red-800 border-red-200" };
    case "graphic_violence":
      return { label: "Graphic violence", className: "bg-orange-100 text-orange-800 border-orange-200" };
    case "doxxing":
      return { label: "Doxxing", className: "bg-amber-100 text-amber-800 border-amber-200" };
    case "none":
      return { label: "Clean", className: "bg-emerald-100 text-emerald-800 border-emerald-200" };
    default:
      return { label: "Unknown", className: "bg-muted text-muted-foreground" };
  }
}

function statusLabel(status: string): { label: string; className: string; icon: React.ReactNode } {
  switch (status) {
    case "pending_review":
      return {
        label: "Awaiting review",
        className: "bg-amber-100 text-amber-800 border-amber-200",
        icon: <Clock className="h-3 w-3" aria-hidden />,
      };
    case "rejected":
      return {
        label: "Rejected",
        className: "bg-red-100 text-red-800 border-red-200",
        icon: <X className="h-3 w-3" aria-hidden />,
      };
    case "self_harm_blocked":
      return {
        label: "Safety — author supported",
        className: "bg-rose-100 text-rose-800 border-rose-200",
        icon: <LifeBuoy className="h-3 w-3" aria-hidden />,
      };
    case "published":
      return {
        label: "Published",
        className: "bg-emerald-100 text-emerald-800 border-emerald-200",
        icon: <Check className="h-3 w-3" aria-hidden />,
      };
    default:
      return {
        label: status,
        className: "bg-muted text-muted-foreground",
        icon: null,
      };
  }
}

function decisionLabel(decision: string): string {
  switch (decision) {
    case "publish":
      return "Auto-publish";
    case "reject":
      return "Auto-reject";
    case "pending_review":
      return "Queued for review";
    case "self_harm_block":
      return "Self-harm block + support";
    case "human_approve":
      return "Human: approved";
    case "human_reject":
      return "Human: rejected";
    case "human_resolve":
      return "Human: resolved";
    default:
      return decision;
  }
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function initials(handle: string): string {
  const parts = handle.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function ReviewItemCard({
  item,
  acting,
  note,
  onNoteChange,
  onApprove,
  onReject,
  onResolve,
}: {
  item: ReviewItem;
  acting: boolean;
  note: string;
  onNoteChange: (v: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onResolve: () => void;
}) {
  const flag = flagLabel(item.moderationFlagType);
  const status = statusLabel(item.moderationStatus);
  const isSelfHarm = item.moderationStatus === "self_harm_blocked";
  // The admin can approve/reject ANY message that is not yet published and
  // not already resolved. This lets the operator overturn a self_harm_block
  // or a previous rejection (e.g. a false positive), in addition to acting
  // on pending_review items.
  const isPending =
    item.moderationStatus !== "published" && !item.adminResolvedAt;
  const conf =
    item.moderationConfidence != null
      ? `${Math.round(item.moderationConfidence * 100)}%`
      : "—";

  return (
    <Card className={isSelfHarm ? "border-rose-200" : undefined}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Avatar className="size-8">
              <AvatarFallback className="bg-secondary text-xs">
                {initials(item.authorHandle)}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-sm font-medium">{item.authorHandle}</CardTitle>
              <p className="text-xs text-muted-foreground">{timeAgo(item.createdAt)}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={status.className}>
              {status.icon}
              {status.label}
            </Badge>
            <Badge variant="outline" className={flag.className}>
              {flag.label}
            </Badge>
            <Badge variant="secondary" className="tabular-nums">
              conf {conf}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isSelfHarm && (
          <div className="flex items-start gap-2 rounded-md bg-rose-50 p-3 text-xs text-rose-800">
            <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              Safety-sensitive case. The author already received a supportive
              response with crisis resources at submit time. Review for pattern
              / escalation; resolving does not distribute the message.
            </p>
          </div>
        )}

        <div className="rounded-md border border-border bg-muted/30 p-3">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {item.content}
          </p>
        </div>

        {item.adminNote && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Moderator note:</span> {item.adminNote}
          </p>
        )}

        {/* Audit log — flag type + confidence + decision only (no trigger words). */}
        {item.logs.length > 0 && (
          <details className="group">
            <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
              <ScrollText className="h-3.5 w-3.5" aria-hidden />
              Audit log ({item.logs.length})
            </summary>
            <ul className="mt-2 space-y-1.5 border-l border-border pl-3">
              {item.logs.map((l) => (
                <li key={l.id} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{decisionLabel(l.decision)}</span>
                  {" · "}
                  {l.flagType !== "none" ? flagLabel(l.flagType).label : "no flag"}
                  {" · "}
                  {Math.round(l.confidence * 100)}% confidence
                  {" · "}
                  {l.modelVersion ?? "—"}
                  {" · "}
                  {timeAgo(l.createdAt)}
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* Moderator actions */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Input
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Optional note (internal)"
            maxLength={500}
            className="h-9 min-w-[12rem] flex-1"
          />
          {isPending && (
            <>
              <Button size="sm" onClick={onApprove} disabled={acting}>
                {acting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                Approve &amp; publish
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" disabled={acting}>
                    <ShieldAlert className="h-4 w-4" aria-hidden />
                    Reject
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reject this message?</AlertDialogTitle>
                    <AlertDialogDescription>
                      It will be kept hidden and not distributed. This cannot be
                      undone from this view.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onReject}>Confirm reject</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
          {!isPending && !item.adminResolvedAt && (
            <Button size="sm" variant="outline" onClick={onResolve} disabled={acting}>
              {acting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
              Mark resolved
            </Button>
          )}
          {item.adminResolvedAt && (
            <Badge variant="secondary" className="gap-1">
              <Check className="h-3 w-3" aria-hidden />
              Resolved
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
