"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, Wrench, XCircle, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import type { StatusLevel } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";

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

          {/* Components */}
          <section className="mt-10">
            <h2 className="text-sm font-semibold text-muted-foreground">Components</h2>
            <div className="mt-3 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.08]">
              {data?.components.map((c) => (
                <Row key={c.key} name={c.name} status={c.status} />
              ))}
            </div>
          </section>

          {/* Regions */}
          {data && data.regions.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-sm font-semibold text-muted-foreground">Regions</h2>
              <div className="mt-3 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.08]">
                {data.regions.map((r) => (
                  <Row key={r.code} name={r.name} status={r.status} />
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
