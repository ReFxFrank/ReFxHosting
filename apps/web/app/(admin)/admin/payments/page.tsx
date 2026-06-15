"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet, Search, Settings2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatMoney } from "@/lib/utils";
import type { PaymentState } from "@/lib/types";

const PAY_VARIANT: Record<PaymentState, BadgeProps["variant"]> = {
  PENDING: "warning",
  SUCCEEDED: "success",
  FAILED: "destructive",
  REFUNDED: "secondary",
};

export default function AdminPaymentsPage() {
  const [search, setSearch] = useState("");
  const [cfgOpen, setCfgOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "payments", search],
    queryFn: () => api.admin.payments(search ? { q: search } : undefined),
  });
  const payments = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="The raw payment ledger — every charge attempt across all gateways. Owner-only."
        actions={
          <Button variant="outline" onClick={() => setCfgOpen(true)}>
            <Settings2 className="size-4" /> Configure gateways
          </Button>
        }
      />

      <GatewayConfigDialog open={cfgOpen} onOpenChange={setCfgOpen} />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by invoice or customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : payments.length ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(p.createdAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {p.invoice?.number ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.invoice?.user?.email ?? "—"}
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">{p.gateway}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={PAY_VARIANT[p.state] ?? "secondary"}>{p.state}</Badge>
                        {p.failureReason && (
                          <span className="hidden max-w-[14rem] truncate text-xs text-muted-foreground lg:inline">
                            {p.failureReason}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(p.amountMinor, p.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={Wallet}
          title="No payments yet"
          description={
            search
              ? "No payments match your search."
              : "Payments will appear here once customers are charged. Configure Stripe via 'Configure gateways'."
          }
        />
      )}
    </div>
  );
}

function GatewayConfigDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: cfg } = useQuery({
    queryKey: ["admin", "gateway-config"],
    queryFn: () => api.admin.gatewayConfig(),
    enabled: open,
  });

  // Secrets are write-only: blank = leave unchanged. Non-secrets are prefilled.
  const [stripeSecret, setStripeSecret] = useState("");
  const [stripeWebhook, setStripeWebhook] = useState("");
  const [stripePub, setStripePub] = useState<string | null>(null);
  const [paypalId, setPaypalId] = useState<string | null>(null);
  const [paypalSecret, setPaypalSecret] = useState("");

  // Initialize prefilled fields once config loads.
  const pub = stripePub ?? cfg?.stripe.publishableKey ?? "";
  const ppId = paypalId ?? cfg?.paypal.clientId ?? "";

  const save = useMutation({
    mutationFn: () => {
      const input: Record<string, string> = {};
      if (stripeSecret) input.stripeSecretKey = stripeSecret;
      if (stripeWebhook) input.stripeWebhookSecret = stripeWebhook;
      input.stripePublishableKey = pub;
      input.paypalClientId = ppId;
      if (paypalSecret) input.paypalClientSecret = paypalSecret;
      return api.admin.setGatewayConfig(input);
    },
    onSuccess: () => {
      toast.success("Gateway settings saved");
      queryClient.invalidateQueries({ queryKey: ["admin", "gateway-config"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "gateways"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "config"] });
      setStripeSecret("");
      setStripeWebhook("");
      setPaypalSecret("");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to save"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Payment gateways</DialogTitle>
          <DialogDescription>
            Secret keys are stored encrypted and never shown again. Leave a secret field
            blank to keep the current value.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm font-medium">
            Stripe{" "}
            <Badge variant={cfg?.stripe.configured ? "success" : "muted"}>
              {cfg?.stripe.configured ? "Connected" : "Not configured"}
            </Badge>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sk">Secret key</Label>
            <Input
              id="sk"
              type="password"
              placeholder={cfg?.stripe.secretKeyMasked || "sk_live_…"}
              value={stripeSecret}
              onChange={(e) => setStripeSecret(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wh">Webhook signing secret</Label>
            <Input
              id="wh"
              type="password"
              placeholder={cfg?.stripe.webhookSecretSet ? "•••• set" : "whsec_…"}
              value={stripeWebhook}
              onChange={(e) => setStripeWebhook(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pk">Publishable key</Label>
            <Input
              id="pk"
              placeholder="pk_live_…"
              value={pub}
              onChange={(e) => setStripePub(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          <div className="border-t pt-3 text-sm font-medium">
            PayPal{" "}
            <Badge variant={cfg?.paypal.configured ? "success" : "muted"}>
              {cfg?.paypal.configured ? "Connected" : "Not configured"}
            </Badge>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ppid">Client ID</Label>
            <Input id="ppid" value={ppId} onChange={(e) => setPaypalId(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pps">Client secret</Label>
            <Input
              id="pps"
              type="password"
              placeholder={cfg?.paypal.clientSecretSet ? "•••• set" : ""}
              value={paypalSecret}
              onChange={(e) => setPaypalSecret(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
