import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ServerState, NodeState } from "@/lib/types";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/15 text-primary",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-foreground",
        success: "border-transparent bg-success/15 text-success",
        warning: "border-transparent bg-warning/15 text-warning",
        destructive: "border-transparent bg-destructive/15 text-destructive",
        muted: "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

const serverStateMap: Record<
  ServerState,
  { label: string; variant: BadgeProps["variant"]; pulse?: boolean }
> = {
  RUNNING: { label: "Running", variant: "success", pulse: true },
  STARTING: { label: "Starting", variant: "warning", pulse: true },
  STOPPING: { label: "Stopping", variant: "warning", pulse: true },
  OFFLINE: { label: "Offline", variant: "muted" },
  CRASHED: { label: "Crashed", variant: "destructive" },
  SUSPENDED: { label: "Suspended", variant: "destructive" },
  INSTALLING: { label: "Installing", variant: "warning", pulse: true },
  REINSTALLING: { label: "Reinstalling", variant: "warning", pulse: true },
  SWITCHING_GAME: { label: "Switching game", variant: "default", pulse: true },
  TRANSFERRING: { label: "Transferring", variant: "default", pulse: true },
};

export function ServerStateBadge({ state }: { state: ServerState }) {
  const cfg = serverStateMap[state] ?? { label: state, variant: "muted" as const };
  return (
    <Badge variant={cfg.variant}>
      <span
        className={cn(
          "size-1.5 rounded-full bg-current",
          cfg.pulse && "animate-pulse",
        )}
      />
      {cfg.label}
    </Badge>
  );
}

const nodeStateMap: Record<NodeState, { label: string; variant: BadgeProps["variant"] }> = {
  ONLINE: { label: "Online", variant: "success" },
  OFFLINE: { label: "Offline", variant: "destructive" },
  PROVISIONING: { label: "Provisioning", variant: "warning" },
  MAINTENANCE: { label: "Maintenance", variant: "warning" },
  DEGRADED: { label: "Degraded", variant: "warning" },
};

export function NodeStateBadge({ state }: { state: NodeState }) {
  const cfg = nodeStateMap[state] ?? { label: state, variant: "muted" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

export { Badge, badgeVariants };
