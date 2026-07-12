"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gift, TrendingUp, UserPlus, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, StatCard } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/utils";

/**
 * Acquisition report: which channels produce signups, which produce payers,
 * and what each landing page earns. Channel = first-touch attribution
 * captured at signup (utm_source → referral link → referring site → direct).
 */

const WINDOWS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
];

export default function AdminGrowthPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "growth", days],
    queryFn: () => api.admin.growth(days),
  });

  const conversionPct = (payers: number, signups: number) =>
    signups > 0 ? `${Math.round((payers / signups) * 100)}%` : "—";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Growth"
        description="Signups, first payments and revenue by acquisition channel (first-touch attribution)."
        actions={
          <div className="flex gap-1">
            {WINDOWS.map((w) => (
              <Button
                key={w.days}
                size="sm"
                variant={days === w.days ? "default" : "outline"}
                onClick={() => setDays(w.days)}
              >
                {w.label}
              </Button>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading || !data ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <StatCard
              label="Signups"
              value={data.totals.signups}
              hint={`last ${data.days} days`}
              icon={UserPlus}
            />
            <StatCard
              label="Paying customers"
              value={data.totals.payers}
              hint={`${conversionPct(data.totals.payers, data.totals.signups)} of signups paid`}
              icon={TrendingUp}
            />
            <StatCard
              label="Paid revenue"
              value={formatMoney(data.totals.revenueMinor, "USD")}
              hint="sum of invoices paid in window"
              icon={Wallet}
            />
            <StatCard
              label="Referral signups"
              value={data.referral.signups}
              hint={`${data.referral.converted} converted · ${formatMoney(
                data.referral.creditIssuedMinor,
                "USD",
              )} credit issued`}
              icon={Gift}
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Channels</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || !data ? (
              <Skeleton className="h-48" />
            ) : data.channels.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead className="text-right">Signups</TableHead>
                    <TableHead className="text-right">Payers</TableHead>
                    <TableHead className="text-right">Conv.</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.channels.map((c) => (
                    <TableRow key={c.channel}>
                      <TableCell className="font-medium">{c.channel}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.signups}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.payers}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {conversionPct(c.payers, c.signups)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(c.revenueMinor, "USD")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="py-6 text-sm text-muted-foreground">
                No signups in this window yet. Channels appear as soon as
                accounts are created — utm-tagged links (e.g.{" "}
                <code className="text-xs">?utm_source=reddit</code>) get their
                own rows automatically.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top landing pages</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || !data ? (
              <Skeleton className="h-48" />
            ) : data.landings.length ? (
              <div className="space-y-2">
                {data.landings.map((l) => (
                  <div
                    key={l.landing}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2"
                  >
                    <span className="truncate font-mono text-xs">{l.landing}</span>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {l.signups} signup{l.signups === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-sm text-muted-foreground">
                The first page a visitor lands on is recorded at signup — rows
                appear here once attributed accounts exist.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Attribution is first-touch: the source recorded when the account&apos;s
        browser first hit the site (stored at signup, kept through checkout).
        Accounts created before attribution shipped show as &quot;direct&quot;.
      </p>
    </div>
  );
}
