"use client";

/**
 * PiiRejectedBanner
 * ---------------------------------------------------------------------------
 * Shown to the AUTHOR when their submission was rejected by the PII filter.
 * Renders the exact spec notice, then previews the submitted text with the
 * detected portions highlighted (<mark>), plus a per-finding category list so
 * the author knows exactly what to remove.
 *
 * Showing the author their OWN text (with highlights) is safe — they wrote
 * it. This is deliberately different from the moderation trigger-word rule,
 * which never reveals matched content.
 * ---------------------------------------------------------------------------
 */

import { ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { PiiFinding } from "@/lib/pii-filter";
import { piiCategoryLabel } from "@/lib/pii-filter";

/**
 * Render text with each finding span wrapped in <mark>. Findings are
 * non-overlapping (deduped server-side) but we sort defensively here.
 */
function renderHighlighted(text: string, findings: PiiFinding[]) {
  const sorted = [...findings].sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  sorted.forEach((f, idx) => {
    if (f.start > cursor) {
      parts.push(<span key={`t${idx}`}>{text.slice(cursor, f.start)}</span>);
    }
    parts.push(
      <mark
        key={`m${idx}`}
        className="rounded bg-amber-300 px-0.5 text-amber-950"
      >
        {text.slice(f.start, f.end)}
      </mark>,
    );
    cursor = Math.max(cursor, f.end);
  });
  if (cursor < text.length) {
    parts.push(<span key="end">{text.slice(cursor)}</span>);
  }
  return parts;
}

export function PiiRejectedBanner({
  notice,
  content,
  findings,
  compact = false,
}: {
  notice: string;
  content: string;
  findings: PiiFinding[];
  compact?: boolean;
}) {
  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-900">
      <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
      <AlertTitle>{compact ? "Removed it?" : "Message not sent"}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p className="text-sm leading-relaxed">{notice}</p>

        {findings.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {findings.map((f, i) => (
              <Badge
                key={i}
                variant="outline"
                className="border-amber-300 bg-white/70 text-amber-800"
              >
                {piiCategoryLabel(f.category)}
              </Badge>
            ))}
          </div>
        )}

        {!compact && content && (
          <div className="rounded-md border border-amber-200 bg-white/70 p-2.5 text-sm leading-relaxed text-foreground">
            {renderHighlighted(content, findings)}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
