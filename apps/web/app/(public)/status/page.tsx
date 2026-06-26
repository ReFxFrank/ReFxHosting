"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, Wrench, XCircle, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import type { StatusLevel, StatusIncident, IncidentImpact, StatusRegion } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusMap } from "@/components/public/status-map";
import { flagEmoji } from "@/lib/geo";

const IMPACT: Record<IncidentImpact, { label: string; cls: string }> = {
  OUTAGE: { label: "Outage", cls: "border-red-500/30 bg-red-500/[0.06] text-red-400" },
  DEGRADED: { label: "Degraded", cls: "border-amber-500/30 bg-amber-500/[0.06] text-amber-400" },
  MAINTENANCE: { label: "Maintenance", cls: "border-sky-500/30 bg-sky-500/[0.06] text-sky-400" },
};
const STAGE_LABEL: Record<string, string> = {
  INVESTIGATING: "Investigating",
  IDENTIFIED: "Identified",
  MONITORING: "Monitoring",
  RESOLVED: "Resolved",
};

const META: Record<
  StatusLevel,
  { label: string; dot: string; text: string; Icon: typeof CheckCircle2 }
> = {
  operational: { label: "Operational", dot: "bg-emerald-500", text: "text-emerald-400", Icon: CheckCircle2 },
  degraded: { label: "Degraded", dot: "bg-amber-500", text: "text-amber-400", Icon: AlertTriangle },
  maintenance: { label: "Maintenance", dot: "bg-sky-500", text: "text-sky-400", Icon: Wrench },
  outage: { label: "Outage", dot: "bg-red-500", text: "text-red-400", Icon: XCircle },
};

const HEADLINE: Record<StatusLevel, string> = {
  operational: "All systems operational",
  degraded: "Some systems degraded",
  maintenance: "Maintenance in progress",
  outage: "Active service disruption",
};

export default function StatusPage() {
  const q = useQuery({
    queryKey: ["public", "status"],
    queryFn: () => api.status(),
    refetchInterval: 30_000,
  });

  const data = q.data;
  const overall = data?.status ?? "operational";
  const top = META[overall];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
      <p className="refx-eyebrow">Status</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">System status</h1>

      {q.isLoading ? (
        <Skeleton className="mt-8 h-24 rounded-2xl" />
      ) : q.isError ? (
        <div className="mt-8 rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-6">
          <p className="font-semibold text-red-400">Status unavailable</p>
          <p className="mt-1 text-sm text-muted-foreground">
            We couldn&apos;t reach the status service. Please try again shortly.
          </p>
        </div>
      ) : (
        <>
          {/* Overall banner */}
          <div
            className={`mt-8 flex items-center gap-4 rounded-2xl border p-6 ${
              overall === "operational"
                ? "border-emerald-500/30 bg-emerald-500/[0.06]"
                : overall === "outage"
                  ? "border-red-500/30 bg-red-500/[0.06]"
                  : overall === "maintenance"
                    ? "border-sky-500/30 bg-sky-500/[0.06]"
                    : "border-amber-500/30 bg-amber-500/[0.06]"
            }`}
          >
            <top.Icon className={`size-8 shrink-0 ${top.text}`} />
            <div>
              <p className="text-lg font-semibold">{HEADLINE[overall]}</p>
              {data?.updatedAt ? (
                <p className="text-xs text-muted-foreground">
                  Updated {new Date(data.updatedAt).toLocaleString()}
                </p>
              ) : null}
            </div>
            {q.isFetching ? (
              <RefreshCw className="ml-auto size-4 animate-spin text-muted-foreground" />
            ) : null}
          </div>

          {/* Active incidents */}
          {data && data.incidents.active.length > 0 ? (
            <section className="mt-8 space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">Active incidents</h2>
              {data.incidents.active.map((inc) => (
                <IncidentCard key={inc.id} incident={inc} />
              ))}
            </section>
          ) : null}

          {/* Components */}
          <section className="mt-10">
            <h2 className="text-sm font-semibold text-muted-foreground">Components</h2>
            <div className="mt-3 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.08]">
              {data?.components.map((c) => (
                <Row key={c.key} name={c.name} status={c.status} />
              ))}
            </div>
          </section>

          {/* Network map */}
          {data && data.regions.length > 0 ? <StatusMap regions={data.regions} /> : null}

          {/* Locations detail */}
          {data && data.regions.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-sm font-semibold text-muted-foreground">Locations</h2>
              <div className="mt-3 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.08]">
                {data.regions.map((r) => (
                  <LocationRow key={r.code} region={r} />
                ))}
              </div>
            </section>
          ) : null}

          {/* Past incidents */}
          {data && data.incidents.recent.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Past incidents (last 30 days)
              </h2>
              <div className="mt-3 space-y-3">
                {data.incidents.recent.map((inc) => (
                  <IncidentCard key={inc.id} incident={inc} resolved />
                ))}
              </div>
            </section>
          ) : null}

          <p className="mt-10 text-xs text-muted-foreground">
            This page reflects live infrastructure health and refreshes
            automatically. For help with a specific server, open a ticket from the{" "}
            <Link href="/support" className="text-foreground underline">support</Link> area.
          </p>
        </>
      )}
    </div>
  );
}

function IncidentCard({ incident, resolved }: { incident: StatusIncident; resolved?: boolean }) {
  const impact = IMPACT[incident.impact];
  return (
    <div className={`rounded-2xl border p-5 ${resolved ? "border-white/[0.08] bg-white/[0.02]" : impact.cls}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${impact.cls}`}>
          {impact.label}
        </span>
        <span className="text-xs text-muted-foreground">
          {STAGE_LABEL[incident.status] ?? incident.status}
        </span>
        {incident.components.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            · {incident.components.join(", ")}
          </span>
        ) : null}
      </div>
      <h3 className="mt-2 font-semibold text-foreground">{incident.title}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Started {new Date(incident.startedAt).toLocaleString()}
        {incident.resolvedAt
          ? ` · Resolved ${new Date(incident.resolvedAt).toLocaleString()}`
          : ""}
      </p>
      <ol className="mt-3 space-y-2 border-l border-white/[0.1] pl-4">
        {incident.updates.map((u, i) => (
          <li key={u.id ?? i} className="text-sm">
            <span className="font-medium text-foreground">
              {STAGE_LABEL[u.status] ?? u.status}
            </span>{" "}
            <span className="text-xs text-muted-foreground">
              {new Date(u.createdAt).toLocaleString()}
            </span>
            <p className="text-muted-foreground">{u.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Row({ name, status }: { name: string; status: StatusLevel }) {
  const m = META[status];
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <span className="text-sm font-medium">{name}</span>
      <span className={`flex items-center gap-2 text-sm ${m.text}`}>
        <span className={`size-2.5 rounded-full ${m.dot}`} aria-hidden="true" />
        {m.label}
      </span>
    </div>
  );
}
// `Row` is still used by the Components section below.

function LocationRow({ region }: { region: StatusRegion }) {
  const m = META[region.status];
  const flag = flagEmoji(region.country);
  const nodeLabel =
    region.nodesTotal === 0
      ? "—"
      : region.nodesUp === region.nodesTotal
        ? `All ${region.nodesTotal} node${region.nodesTotal > 1 ? "s" : ""} operational`
        : `${region.nodesUp} of ${region.nodesTotal} nodes operational`;
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium">
          {flag ? <span aria-hidden="true">{flag}</span> : null}
          {region.name}
          <span className="text-xs font-normal text-muted-foreground">{region.country}</span>
        </p>
        <p className="text-xs text-muted-foreground">{nodeLabel}</p>
      </div>
      <span className={`flex shrink-0 items-center gap-2 text-sm ${m.text}`}>
        <span className={`size-2.5 rounded-full ${m.dot}`} aria-hidden="true" />
        {m.label}
      </span>
    </div>
  );
}
