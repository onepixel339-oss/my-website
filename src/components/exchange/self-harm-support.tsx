"use client";

/**
 * SelfHarmSupportCard
 * ---------------------------------------------------------------------------
 * The supportive response shown to the AUTHOR of a message that was flagged
 * for self-harm / suicide risk. Their message was NOT distributed to others;
 * instead they see this warm acknowledgment plus local (Egypt) and
 * international crisis resources.
 *
 * Privacy: this card never echoes the flagged message content and never
 * reveals which words triggered the flag. It only acknowledges that the
 * message was heard and points to help.
 * ---------------------------------------------------------------------------
 */

import { LifeBuoy, Phone, Globe, Clock, ExternalLink } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface CrisisResource {
  name: string;
  phone?: string;
  url?: string;
  hours?: string;
  description: string;
}

export interface SelfHarmSupportPayload {
  message: string;
  localResources: CrisisResource[];
  internationalResources: CrisisResource[];
}

function ResourceItem({ resource }: { resource: CrisisResource }) {
  return (
    <div className="rounded-lg border border-rose-200/70 bg-white/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="font-semibold text-foreground leading-snug">{resource.name}</h4>
        {resource.hours && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            <Clock className="h-3 w-3" aria-hidden />
            {resource.hours}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
        {resource.description}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {resource.phone && (
          <a
            href={`tel:${resource.phone.replace(/[^0-9+]/g, "")}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
          >
            <Phone className="h-4 w-4" aria-hidden />
            {resource.phone}
          </a>
        )}
        {resource.url && (
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <Globe className="h-4 w-4" aria-hidden />
            Website
            <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
          </a>
        )}
      </div>
    </div>
  );
}

export function SelfHarmSupportCard({ support }: { support: SelfHarmSupportPayload }) {
  return (
    <Card className="border-rose-300 bg-rose-50/60 shadow-sm">
      <CardHeader className="gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-white">
            <LifeBuoy className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <CardTitle className="text-lg text-rose-900">
              You&apos;ve been heard — and you don&apos;t have to carry this alone
            </CardTitle>
            <CardDescription className="text-rose-700/90">
              Your message wasn&apos;t shared with others. We want to make sure you&apos;re okay.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="rounded-lg bg-white/70 p-4 text-sm leading-relaxed text-foreground">
          {support.message}
        </p>

        {support.localResources.length > 0 && (
          <div className="space-y-2.5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-rose-800">
              Help in Egypt
            </h3>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {support.localResources.map((r) => (
                <ResourceItem key={r.name} resource={r} />
              ))}
            </div>
          </div>
        )}

        {support.internationalResources.length > 0 && (
          <div className="space-y-2.5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-rose-800">
              International &amp; online support
            </h3>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {support.internationalResources.map((r) => (
                <ResourceItem key={r.name} resource={r} />
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-rose-700/80">
          If you or someone else is in immediate danger, contact your local
          emergency services.
        </p>
      </CardContent>
    </Card>
  );
}
