"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowDownUp, Gauge, Signal, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, StatCard } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Human "N ago" from a duration in ms (as-of the API response — clock-free). */
function ago(ms: number | null): string {
  if (ms == null) return "never";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

type NetNode = Awaited<ReturnType<typeof api.admin.network>>["nodes"][number];

const HEALTH: Record<
  NetNode["health"],
  { label: string; variant: "success" | "warning" | "destructive" }
> = {
  healthy: { label: "Healthy", variant: "success" },
  degraded: { label: "Degraded", variant: "warning" },
  down: { label: "Down", variant: "destructive" },
};

/** Tiny inline latency sparkline; null samples (failed probes) render as gaps. */
function Sparkline({ data }: { data: (number | null)[] }) {
  const pts = data.filter((v): v is number => v != null);
  if (pts.length < 2) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const w = 96;
  const h = 24;
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const span = max - min || 1;
  const n = data.length;
  const segs: string[] = [];
  let cur: string[] = [];
  data.forEach((v, i) => {
    if (v == null) {
      if (cur.length) segs.push(cur.join(" "));
      cur = [];
      return;
    }
    const x = (i / (n - 1)) * w;
    const y = h - ((v - min) / span) * h;
    cur.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  if (cur.length) segs.push(cur.join(" "));
  return (
    <svg width={w} height={h} className="overflow-visible">
      {segs.map((s, i) => (
        <polyline
          key={i}
          points={s}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="text-primary/70"
        />
      ))}
    </svg>
  );
}

export default function AdminNetworkPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "network"],
    queryFn: () => api.admin.network(),
    refetchInterval: 15_000, // live-ish; the backend probes every 30s
  });

  const ms = (v: number | null | undefined) =>
    v == null ? "—" : `${v} ms`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Network status"
        description="Panel↔node link health across the fleet — latency, jitter, packet loss and throughput. Probed every 30s."
      />

      {isLoading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <>
          {!data.monitor && (
            <Card className="border-warning/40 bg-warning/5">
              <CardContent className="flex items-center gap-3 p-4 text-sm">
                <TriangleAlert className="size-4 text-warning" />
                Network monitoring is disabled (NETWORK_MONITOR=false). Metrics
                below are static.
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Nodes"
              value={data.rollup.nodes}
              hint={`${data.rollup.healthy} healthy · ${data.rollup.degraded} degraded · ${data.rollup.down} down`}
              icon={Signal}
            />
            <StatCard
              label="Worst packet loss"
              value={`${data.rollup.worstLossPct}%`}
              hint="highest across all nodes"
              icon={TriangleAlert}
            />
            <StatCard
              label="Worst p95 latency"
              value={ms(data.rollup.worstP95Ms)}
              hint="panel → node round-trip"
              icon={Gauge}
            />
            <StatCard
              label="Fleet throughput"
              value={`${data.rollup.totalRxMbps} / ${data.rollup.totalTxMbps} Mbps`}
              hint="rx / tx across nodes"
              icon={ArrowDownUp}
            />
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Node</TableHead>
                      <TableHead>Health</TableHead>
                      <TableHead className="text-right">Latency</TableHead>
                      <TableHead className="text-right">p95</TableHead>
                      <TableHead className="text-right">Jitter</TableHead>
                      <TableHead className="text-right">Loss</TableHead>
                      <TableHead className="text-right">Uptime</TableHead>
                      <TableHead className="text-right">Rx / Tx</TableHead>
                      <TableHead>Latency (window)</TableHead>
                      <TableHead className="text-right">Last seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.nodes.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={10}
                          className="py-8 text-center text-sm text-muted-foreground"
                        >
                          No nodes registered yet.
                        </TableCell>
                      </TableRow>
                    )}
                    {data.nodes.map((n) => {
                      const badge = HEALTH[n.health];
                      return (
                        <TableRow key={n.nodeId}>
                          <TableCell>
                            <span className="font-medium">{n.name}</span>{" "}
                            <span className="text-xs text-muted-foreground">
                              {n.region}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {ms(n.latencyMs)}
                            {n.avgMs != null && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                (avg {n.avgMs})
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {ms(n.p95Ms)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {n.jitterMs} ms
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${n.lossPct >= 10 ? "text-destructive" : ""}`}
                          >
                            {n.lossPct}%
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {n.uptimePct}%
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {n.rxMbps} / {n.txMbps}
                          </TableCell>
                          <TableCell>
                            <span className="text-muted-foreground">
                              <Sparkline data={n.latencyHistory} />
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {ago(n.heartbeatAgeMs)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Activity className="size-3.5" />
            Loss/latency measure the panel→node control path over the last{" "}
            {data.windowSamples} probes ({Math.round((data.windowSamples * data.cadenceSec) / 60)} min).
            Throughput is the node&apos;s reported interface rate between the two
            most recent heartbeats.
          </p>
        </>
      )}
    </div>
  );
}
