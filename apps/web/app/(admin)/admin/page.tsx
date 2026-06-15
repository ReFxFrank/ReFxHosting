"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Server as ServerIcon,
  Users,
  CreditCard,
  LifeBuoy,
  Cpu,
  MemoryStick,
  HardDrive,
  Boxes,
  ScrollText,
  Megaphone,
  Store,
  Package,
  Layers,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, StatCard, EmptyState } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/utils";

const QUICK_LINKS: { href: string; label: string; description: string; icon: LucideIcon }[] = [
  { href: "/admin/nodes", label: "Nodes", description: "Capacity & health", icon: Boxes },
  { href: "/admin/users", label: "Users", description: "Accounts & access", icon: Users },
  { href: "/admin/products", label: "Products", description: "Plans & resources", icon: Package },
  { href: "/admin/templates", label: "Templates", description: "Game eggs", icon: Layers },
  { href: "/admin/audit", label: "Audit log", description: "Activity trail", icon: ScrollText },
  { href: "/admin/alerts", label: "Alerts", description: "Internal dashboard notices", icon: Megaphone },
  { href: "/admin/homepage-alerts", label: "Homepage alerts", description: "Public storefront notices", icon: Store },
];

function indicatorClass(value: number) {
  return value > 90 ? "bg-destructive" : value > 70 ? "bg-warning" : "bg-primary";
}

export default function AdminOverviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "metrics"],
    queryFn: () => api.admin.metrics(),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin overview"
        description="Platform-wide monitoring and management."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <StatCard
              label="Servers"
              value={data?.totals.servers ?? 0}
              hint="across all nodes"
              icon={ServerIcon}
            />
            <StatCard
              label="Users"
              value={data?.totals.users ?? 0}
              hint="registered accounts"
              icon={Users}
            />
            <StatCard
              label="Revenue"
              value={formatMoney(data?.totals.revenueMinor ?? 0)}
              hint="this month"
              icon={CreditCard}
            />
            <StatCard
              label="Open tickets"
              value={data?.totals.openTickets ?? 0}
              hint="awaiting response"
              icon={LifeBuoy}
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Node health</CardTitle>
            <Link
              href="/admin/nodes"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Manage nodes
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)
            ) : data?.nodes?.length ? (
              data.nodes.map((node) => (
                <div key={node.id} className="rounded-lg border p-4">
                  <p className="mb-3 truncate font-medium">{node.name}</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <NodeBar icon={Cpu} label="CPU" value={node.cpuPct} />
                    <NodeBar icon={MemoryStick} label="MEM" value={node.memPct} />
                    <NodeBar icon={HardDrive} label="DISK" value={node.diskPct} />
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                icon={Boxes}
                title="No nodes reporting"
                description="Add a node to start monitoring capacity and health."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>CPU by node</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : data?.nodes?.length ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.nodes.map((n) => ({ name: n.name, cpu: n.cpuPct }))}
                    margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <ReTooltip
                      cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v) => [`${v}%`, "CPU"] as [string, string]}
                    />
                    <Bar dataKey="cpu" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">No data.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Quick navigation
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link key={link.href} href={link.href}>
                <Card className="transition-colors hover:bg-accent">
                  <CardContent className="flex items-center gap-4 p-5">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{link.label}</p>
                      <p className="truncate text-sm text-muted-foreground">{link.description}</p>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NodeBar({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="size-3.5" /> {label}
        </span>
        <span className="font-medium tabular-nums">{value}%</span>
      </div>
      <Progress value={value} indicatorClassName={indicatorClass(value)} />
    </div>
  );
}
