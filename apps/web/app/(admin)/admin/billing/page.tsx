"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  CreditCard,
  TrendingUp,
  CircleDollarSign,
  Repeat,
  FileWarning,
  CheckCircle2,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, StatCard } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/utils";

export default function AdminBillingPage() {
  const summary = useQuery({
    queryKey: ["admin", "billing-summary"],
    queryFn: () => api.admin.billingSummary(),
  });
  const gateways = useQuery({
    queryKey: ["admin", "gateways"],
    queryFn: () => api.admin.paymentGateways(),
    retry: false,
  });

  const s = summary.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="Platform revenue, subscriptions and payment-gateway configuration."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/invoices">View invoices</Link>
          </Button>
        }
      />

      {summary.isLoading || !s ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Revenue (collected)"
            value={formatMoney(s.revenueMinor, s.currency)}
            icon={TrendingUp}
          />
          <StatCard
            label="Outstanding"
            value={formatMoney(s.outstandingMinor, s.currency)}
            hint="Open invoices awaiting payment"
            icon={CircleDollarSign}
          />
          <StatCard
            label="Active subscriptions"
            value={s.activeSubscriptions}
            icon={Repeat}
          />
          <StatCard label="Open invoices" value={s.openInvoices} icon={FileWarning} />
          <StatCard label="Paid invoices" value={s.paidInvoices} icon={CheckCircle2} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="size-4" /> Payment gateways
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {gateways.isError ? (
            <p className="text-sm text-muted-foreground">
              Gateway status is restricted to owners.
            </p>
          ) : (
            <>
              <GatewayRow
                name="Stripe"
                configured={gateways.data?.stripe.configured}
                detail={
                  gateways.data?.stripe.configured
                    ? "Live — accepting payments"
                    : "Set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET to enable"
                }
              />
              <GatewayRow
                name="PayPal"
                configured={gateways.data?.paypal.configured}
                detail={
                  gateways.data?.paypal.configured
                    ? "Configured"
                    : "Set PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET to enable"
                }
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GatewayRow({
  name,
  configured,
  detail,
}: {
  name: string;
  configured?: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
      <div>
        <div className="text-sm font-medium">{name}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
      <Badge variant={configured ? "success" : "muted"}>
        {configured ? "Connected" : "Not configured"}
      </Badge>
    </div>
  );
}
