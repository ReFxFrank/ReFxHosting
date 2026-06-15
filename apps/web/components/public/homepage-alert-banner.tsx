"use client";

import { useState } from "react";
import Link from "next/link";
import { Info, CheckCircle2, TriangleAlert, OctagonAlert, Sparkles, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HomepageAlert, HomepageAlertType } from "@/lib/types";

const STYLES: Record<
  HomepageAlertType,
  { icon: typeof Info; wrap: string; iconColor: string }
> = {
  INFO: { icon: Info, wrap: "border-primary/30 bg-primary/[0.07]", iconColor: "text-primary" },
  SUCCESS: { icon: CheckCircle2, wrap: "border-success/30 bg-success/[0.07]", iconColor: "text-success" },
  WARNING: { icon: TriangleAlert, wrap: "border-warning/30 bg-warning/[0.07]", iconColor: "text-warning" },
  DANGER: { icon: OctagonAlert, wrap: "border-destructive/30 bg-destructive/[0.07]", iconColor: "text-destructive" },
  PROMO: { icon: Sparkles, wrap: "border-primary/40 bg-primary/[0.1]", iconColor: "text-primary" },
};

/** Renders active public homepage notices; each can be dismissed for the session. */
export function HomepageAlertBanner({ alerts }: { alerts: HomepageAlert[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = alerts.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-2 px-4 pt-4 sm:px-6">
      {visible.map((a) => {
        const s = STYLES[a.type] ?? STYLES.INFO;
        const Icon = s.icon;
        return (
          <div
            key={a.id}
            className={cn(
              "flex items-start gap-3 rounded-xl border px-4 py-3 backdrop-blur-md",
              s.wrap,
            )}
          >
            <Icon className={cn("mt-0.5 size-5 shrink-0", s.iconColor)} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{a.title}</p>
              <p className="text-sm text-muted-foreground">{a.body}</p>
              {a.ctaLabel && a.ctaUrl && (
                <Link
                  href={a.ctaUrl}
                  className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  {a.ctaLabel} <ArrowRight className="size-3.5" />
                </Link>
              )}
            </div>
            {a.dismissible && (
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setDismissed((d) => new Set(d).add(a.id))}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
