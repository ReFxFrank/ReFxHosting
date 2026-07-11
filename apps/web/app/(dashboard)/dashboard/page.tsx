"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Server as ServerIcon,
  Cpu,
  MemoryStick,
  HardDrive,
  CreditCard,
  Activity,
  AlertTriangle,
  Gift,
  Plus,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, StatCard, EmptyState } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, ServerStateBadge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { copyToClipboard, formatMoney, formatMb, formatRelative } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { useAuthStore } from "@/store/auth";

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.dashboard.summary(),
  });

  const servers = useMemo(() => data?.servers ?? [], [data]);
  // Allocated (provisioned) resources across the customer's servers. Live usage
  // lives on each server's page; the dashboard shows what's reserved.
  const allocated = useMemo(
    () =>
      servers.reduce(
        (acc, s) => {
          acc.cpu += s.cpuCores ?? 0;
          acc.mem += s.memoryMb ?? 0;
          acc.disk += s.diskMb ?? 0;
          return acc;
        },
        { cpu: 0, mem: 0, disk: 0 },
      ),
    [servers],
  );
  const pendingCount = servers.filter((s) => s.state === "PENDING_PAYMENT").length;
  const activeCount = servers.filter(
    (s) => s.state !== "SUSPENDED" && s.state !== "PENDING_PAYMENT",
  ).length;
  const openInvoices = data?.billing.openInvoices ?? 0;
  const needsPayment = openInvoices > 0 || pendingCount > 0;

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

      {!isLoading && needsPayment && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 text-warning" />
              <div>
                <p className="font-medium">Payment required</p>
                <p className="text-sm text-muted-foreground">
                  {pendingCount > 0
                    ? `You have ${pendingCount} server${pendingCount === 1 ? "" : "s"} awaiting payment. `
                    : ""}
                  {openInvoices > 0
                    ? `${openInvoices} open invoice${openInvoices === 1 ? "" : "s"} — complete payment to activate your service.`
                    : "Complete payment to start provisioning."}
                </p>
              </div>
            </div>
            <Button asChild>
              <Link href="/billing">
                <CreditCard className="size-4" /> Pay now
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

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
              value={activeCount}
              hint={`${servers.length} total${pendingCount ? ` · ${pendingCount} awaiting payment` : ""}`}
              icon={ServerIcon}
            />
            <StatCard
              label="Allocated vCPU"
              value={Number(allocated.cpu.toFixed(2))}
              hint={`across ${servers.length} server${servers.length === 1 ? "" : "s"}`}
              icon={Cpu}
            />
            <StatCard
              label="Allocated memory"
              value={formatMb(allocated.mem)}
              hint={`${formatMb(allocated.disk)} disk`}
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
            ) : servers.length ? (
              servers.slice(0, 5).map((server) => {
                const pending = server.state === "PENDING_PAYMENT";
                return (
                  <Link
                    key={server.id}
                    href={pending ? "/billing" : `/servers/${server.id}/console`}
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
                    {pending ? (
                      <Badge variant="warning">Complete payment</Badge>
                    ) : server.primaryAllocation ? (
                      <Badge variant="secondary" className="font-mono">
                        {server.primaryAllocation.alias || server.primaryAllocation.ip}:{server.primaryAllocation.port}
                      </Badge>
                    ) : null}
                  </Link>
                );
              })
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

      <ReferralPromoCard />

      {servers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Allocated resources</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-3">
            <AllocatedStat icon={Cpu} label="vCPU" value={`${Number(allocated.cpu.toFixed(2))} cores`} />
            <AllocatedStat icon={MemoryStick} label="Memory" value={formatMb(allocated.mem)} />
            <AllocatedStat icon={HardDrive} label="Disk" value={formatMb(allocated.disk)} />
            <p className="text-xs text-muted-foreground sm:col-span-3">
              Reserved across your servers. Live CPU/RAM usage is shown on each
              server&apos;s page.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Compact give-and-get referral banner. Renders nothing unless the program
 * is enabled — the full stats live on the Account page.
 */
function ReferralPromoCard() {
  const { data } = useQuery({
    queryKey: ["billing", "referral"],
    queryFn: () => api.billing.referral(),
    staleTime: 5 * 60_000,
  });
  const [copied, setCopied] = useState(false);
  if (!data?.enabled || !data.code || data.rewardMinor <= 0) return null;

  const link = `${window.location.origin}/register?ref=${data.code}`;
  const reward = formatMoney(data.rewardMinor, "USD");
  const copy = async () => {
    try {
      if (!(await copyToClipboard(link))) throw new Error();
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Gift className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="font-medium">Give {reward}, get {reward}</p>
            <p className="text-sm text-muted-foreground">
              When a friend makes their first purchase, you both receive{" "}
              {reward} in account credit — it applies automatically at
              checkout and renewals.
            </p>
          </div>
        </div>
        <div className="flex w-full gap-2 sm:w-auto sm:max-w-sm">
          <Input readOnly value={link} className="font-mono text-xs" />
          <Button variant="outline" className="shrink-0" onClick={copy}>
            {copied ? "Copied!" : "Copy link"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AllocatedStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.015] p-3">
      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </div>
      <div>
        <p className="refx-eyebrow">{label}</p>
        <p className="font-semibold">{value}</p>
      </div>
    </div>
  );
}
