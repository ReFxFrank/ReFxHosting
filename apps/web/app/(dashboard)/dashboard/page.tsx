"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Server as ServerIcon,
  Cpu,
  MemoryStick,
  HardDrive,
  CreditCard,
  Activity,
  AlertTriangle,
  Plus,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, StatCard, EmptyState } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, ServerStateBadge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, formatMb, formatRelative, pct } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.dashboard.summary(),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title={`Welcome${user?.firstName ? `, ${user.firstName}` : ""}`}
        description="Here's what's happening across your services."
        actions={
          <Button asChild>
            <Link href="/order">
              <Plus className="size-4" /> New server
            </Link>
          </Button>
        }
      />

      {data?.alerts?.filter((a) => a.isActive).map((alert) => (
        <Card key={alert.id} className="border-warning/40 bg-warning/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 size-5 text-warning" />
            <div>
              <p className="font-medium">{alert.title}</p>
              <p className="text-sm text-muted-foreground">{alert.body}</p>
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <StatCard
              label="Active servers"
              value={data?.servers?.filter((s) => s.state !== "SUSPENDED").length ?? 0}
              hint={`${data?.servers?.length ?? 0} total`}
              icon={ServerIcon}
            />
            <StatCard
              label="CPU usage"
              value={`${data?.usage.cpuPct ?? 0}%`}
              hint="across all nodes"
              icon={Cpu}
            />
            <StatCard
              label="Memory"
              value={formatMb(data?.usage.memUsedMb ?? 0)}
              hint={`of ${formatMb(data?.usage.memTotalMb ?? 0)}`}
              icon={MemoryStick}
            />
            <StatCard
              label="Next invoice"
              value={formatMoney(data?.billing.nextInvoiceMinor ?? 0, data?.billing.currency)}
              hint={data?.billing.nextDueAt ? `due ${formatRelative(data.billing.nextDueAt)}` : "no upcoming charges"}
              icon={CreditCard}
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Your servers</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/servers">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)
            ) : data?.servers?.length ? (
              data.servers.slice(0, 5).map((server) => (
                <Link
                  key={server.id}
                  href={`/servers/${server.id}/console`}
                  className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.015] p-3 transition-all hover:border-primary/30 hover:bg-primary/[0.06]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{server.name}</p>
                      <ServerStateBadge state={server.state} />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {server.template?.name ?? "No game installed"} · {server.cpuCores} vCPU ·{" "}
                      {formatMb(server.memoryMb)}
                    </p>
                  </div>
                  {server.primaryAllocation && (
                    <Badge variant="secondary" className="font-mono">
                      {server.primaryAllocation.ip}:{server.primaryAllocation.port}
                    </Badge>
                  )}
                </Link>
              ))
            ) : (
              <EmptyState
                icon={ServerIcon}
                title="No servers yet"
                description="Order your first game server to get started."
                action={
                  <Button asChild>
                    <Link href="/order">Browse plans</Link>
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-4" /> Recent activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)
            ) : data?.activity?.length ? (
              data.activity.slice(0, 8).map((log) => (
                <div key={log.id} className="flex items-start gap-3 text-sm">
                  <div className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0">
                    <p className="truncate">
                      <span className="font-medium">{log.action}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatRelative(log.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No recent activity.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {data?.usage && (
        <Card>
          <CardHeader>
            <CardTitle>Resource utilisation</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-3">
            <UsageBar
              icon={Cpu}
              label="CPU"
              value={data.usage.cpuPct}
              display={`${data.usage.cpuPct}%`}
            />
            <UsageBar
              icon={MemoryStick}
              label="Memory"
              value={pct(data.usage.memUsedMb, data.usage.memTotalMb)}
              display={`${formatMb(data.usage.memUsedMb)} / ${formatMb(data.usage.memTotalMb)}`}
            />
            <UsageBar
              icon={HardDrive}
              label="Disk"
              value={pct(data.usage.diskUsedMb, data.usage.diskTotalMb)}
              display={`${formatMb(data.usage.diskUsedMb)} / ${formatMb(data.usage.diskTotalMb)}`}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function UsageBar({
  icon: Icon,
  label,
  value,
  display,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  display: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-4" /> {label}
        </span>
        <span className="font-medium">{display}</span>
      </div>
      <Progress
        value={value}
        indicatorClassName={value > 90 ? "bg-destructive" : value > 70 ? "bg-warning" : "bg-primary"}
      />
    </div>
  );
}
