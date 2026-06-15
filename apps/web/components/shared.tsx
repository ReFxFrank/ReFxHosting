// Small shared presentational helpers reused across pages.
import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="space-y-1">
        {eyebrow && <p className="refx-eyebrow">{eyebrow}</p>}
        <h1 className="text-xl font-semibold tracking-tight text-[hsl(213_100%_97%)] sm:text-2xl">
          {title}
        </h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 bg-white/[0.015] py-14 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="flex size-12 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary shadow-[0_0_24px_-10px_rgba(0,114,255,0.6)]">
          <Icon className="size-6" />
        </div>
      )}
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="refx-inner-glow overflow-hidden">
      <CardContent className="flex items-start justify-between gap-2 p-4">
        <div className="space-y-1.5">
          <p className="refx-eyebrow">{label}</p>
          <p className="text-2xl font-semibold tracking-tight text-[hsl(213_100%_97%)]">
            {value}
          </p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {Icon && (
          <div className="flex size-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary shadow-[0_0_18px_-8px_rgba(0,114,255,0.7)]">
            <Icon className="size-5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}
