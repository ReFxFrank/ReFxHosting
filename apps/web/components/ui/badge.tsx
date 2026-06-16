import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ServerState, NodeState, TicketState, TicketPriority } from "@/lib/types";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] transition-colors",
  {
    variants: {
      variant: {
        default: "border-primary/25 bg-primary/15 text-[hsl(214_100%_78%)]",
        secondary: "border-white/10 bg-white/[0.05] text-secondary-foreground",
        outline: "border-white/15 text-foreground",
        success: "border-success/25 bg-success/15 text-[hsl(152_60%_62%)]",
        warning: "border-warning/25 bg-warning/15 text-[hsl(38_92%_66%)]",
        destructive: "border-destructive/30 bg-destructive/15 text-[hsl(0_80%_72%)]",
        muted: "border-white/10 bg-white/[0.04] text-muted-foreground",
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
  PENDING_PAYMENT: { label: "Awaiting payment", variant: "warning" },
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

const ticketStateMap: Record<TicketState, { label: string; variant: BadgeProps["variant"] }> = {
  OPEN: { label: "Open", variant: "default" },
  PENDING_CUSTOMER: { label: "Pending you", variant: "warning" },
  PENDING_AGENT: { label: "Pending agent", variant: "secondary" },
  RESOLVED: { label: "Resolved", variant: "muted" },
  CLOSED: { label: "Closed", variant: "muted" },
};

export function TicketStateBadge({ state }: { state: TicketState }) {
  const cfg = ticketStateMap[state] ?? { label: state, variant: "muted" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

export function priorityVariant(priority: TicketPriority): BadgeProps["variant"] {
  if (priority === "URGENT") return "destructive";
  if (priority === "HIGH") return "warning";
  return "muted";
}

const priorityLabel: Record<TicketPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export function TicketPriorityBadge({ priority }: { priority: TicketPriority }) {
  return <Badge variant={priorityVariant(priority)}>{priorityLabel[priority] ?? priority}</Badge>;
}

export { Badge, badgeVariants };
