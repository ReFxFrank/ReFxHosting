"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard,
  FileText,
  RefreshCw,
  Repeat,
  Receipt,
  Download,
  MoreHorizontal,
  Eye,
  CircleDollarSign,
  Plus,
  Trash2,
  Star,
  CalendarClock,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { AddCardDialog } from "@/components/billing/add-card-dialog";
import {
  PageHeader,
  StatCard,
  EmptyState,
  ListSkeleton,
} from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { formatMoney, formatDate } from "@/lib/utils";
import type {
  Invoice,
  InvoiceState,
  Subscription,
  PaymentMethod,
  BillingInterval,
} from "@/lib/types";

const invoiceStateMap: Record<
  InvoiceState,
  { label: string; variant: BadgeProps["variant"] }
> = {
  DRAFT: { label: "Draft", variant: "muted" },
  OPEN: { label: "Open", variant: "warning" },
  PAID: { label: "Paid", variant: "success" },
  VOID: { label: "Void", variant: "muted" },
  UNCOLLECTIBLE: { label: "Uncollectible", variant: "muted" },
  REFUNDED: { label: "Refunded", variant: "secondary" },
};

const subStateMap: Record<
  Subscription["state"],
  { label: string; variant: BadgeProps["variant"] }
> = {
  TRIALING: { label: "Trialing", variant: "default" },
  ACTIVE: { label: "Active", variant: "success" },
  PAST_DUE: { label: "Past due", variant: "warning" },
  CANCELED: { label: "Canceled", variant: "muted" },
  SUSPENDED: { label: "Suspended", variant: "destructive" },
  EXPIRED: { label: "Expired", variant: "muted" },
};

const intervalLabel: Record<BillingInterval, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Every 2 weeks",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  SEMIANNUAL: "Every 6 months",
  ANNUAL: "Annually",
};

/** Open an invoice PDF, warning if the browser blocked the pop-up. */
function openPdf(url: string) {
  const w = window.open(url, "_blank", "noopener");
  if (!w)
    toast.error("Couldn't open the invoice — allow pop-ups and try again.");
}

export default function BillingPage() {
  const queryClient = useQueryClient();
  // On return from PayPal approval, the order id arrives as ?token=...&PayerID=...
  // Capture it once, then clean the URL.
  const captured = useRef(false);
  useEffect(() => {
    if (captured.current || typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const token = sp.get("token");
    if (token && sp.get("PayerID")) {
      captured.current = true;
      window.history.replaceState({}, "", "/billing");
      api.billing
        .capturePaypal(token)
        .then(() => {
          toast.success("PayPal payment received — thank you!");
          queryClient.invalidateQueries({ queryKey: ["billing"] });
        })
        .catch((e) =>
          toast.error(
            e instanceof ApiError ? e.message : "PayPal capture failed",
          ),
        );
    }
  }, [queryClient]);

  const invoicesQuery = useQuery({
    queryKey: ["billing", "invoices"],
    queryFn: () => api.billing.invoices(),
  });
  const subsQuery = useQuery({
    queryKey: ["billing", "subscriptions"],
    queryFn: () => api.billing.subscriptions(),
  });
  const methodsQuery = useQuery({
    queryKey: ["billing", "payment-methods"],
    queryFn: () => api.billing.paymentMethods(),
  });

  const openInvoices =
    invoicesQuery.data?.filter((i) => i.state === "OPEN") ?? [];
  const activeSubs =
    subsQuery.data?.filter(
      (s) => s.state === "ACTIVE" || s.state === "TRIALING",
    ) ?? [];
  const nextPayment = openInvoices.reduce((acc, i) => acc + i.totalMinor, 0);
  const nextCurrency = openInvoices[0]?.currency ?? "USD";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="Manage your invoices, subscriptions and payment methods."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {invoicesQuery.isLoading || subsQuery.isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))
        ) : (
          <>
            <StatCard
              label="Open invoices"
              value={openInvoices.length}
              hint={openInvoices.length ? "awaiting payment" : "all settled"}
              icon={Receipt}
            />
            <StatCard
              label="Active subscriptions"
              value={activeSubs.length}
              hint={`${subsQuery.data?.length ?? 0} total`}
              icon={Repeat}
            />
            <StatCard
              label="Next payment"
              value={formatMoney(nextPayment, nextCurrency)}
              hint={
                openInvoices[0]?.dueAt
                  ? `due ${formatDate(openInvoices[0].dueAt)}`
                  : "no upcoming charges"
              }
              icon={CircleDollarSign}
            />
          </>
        )}
      </div>

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">
            <FileText /> Invoices
          </TabsTrigger>
          <TabsTrigger value="subscriptions">
            <Repeat /> Subscriptions
          </TabsTrigger>
          <TabsTrigger value="payment-methods">
            <CreditCard /> Payment methods
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices">
          <InvoicesTab
            invoices={invoicesQuery.data}
            isLoading={invoicesQuery.isLoading}
          />
        </TabsContent>

        <TabsContent value="subscriptions">
          <SubscriptionsTab
            subscriptions={subsQuery.data}
            isLoading={subsQuery.isLoading}
          />
        </TabsContent>

        <TabsContent value="payment-methods">
          <PaymentMethodsTab
            methods={methodsQuery.data}
            isLoading={methodsQuery.isLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

function InvoicesTab({
  invoices,
  isLoading,
}: {
  invoices?: Invoice[];
  isLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const [viewId, setViewId] = useState<string | null>(null);

  // Whether online checkout is available (Stripe publishable key / PayPal set).
  const { data: payCfg } = useQuery({
    queryKey: ["billing", "config"],
    queryFn: () => api.billing.config(),
    retry: false,
  });
  const stripeOn = !!payCfg?.stripe.configured;
  const paypalOn = !!payCfg?.paypal.configured;
  const checkoutEnabled = stripeOn || paypalOn;

  const payMutation = useMutation({
    mutationFn: (vars: { id: string; gateway?: "stripe" | "paypal" }) =>
      api.billing.payInvoice(vars.id, vars.gateway),
    onSuccess: (res) => {
      if (res?.checkoutUrl) {
        // Hand off to the gateway's hosted checkout (Stripe Checkout / PayPal).
        window.location.href = res.checkoutUrl;
        return;
      }
      toast.success("Payment submitted.");
      queryClient.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to pay invoice"),
  });

  if (isLoading) return <ListSkeleton rows={5} />;

  if (!invoices?.length) {
    return (
      <EmptyState
        icon={FileText}
        title="No invoices yet"
        description="Invoices will appear here once you place an order or a subscription renews."
      />
    );
  }

  return (
    <>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => {
              const cfg = invoiceStateMap[invoice.state];
              return (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">
                    {invoice.number}
                  </TableCell>
                  <TableCell>
                    <Badge variant={cfg.variant}>{cfg.label}</Badge>
                  </TableCell>
                  <TableCell>
                    {formatMoney(invoice.totalMinor, invoice.currency)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(invoice.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {invoice.dueAt ? formatDate(invoice.dueAt) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {invoice.state === "OPEN" && (
                        <>
                          <Button
                            size="sm"
                            disabled={!checkoutEnabled}
                            title={
                              checkoutEnabled
                                ? undefined
                                : "Online payments aren't enabled yet"
                            }
                            loading={
                              payMutation.isPending &&
                              payMutation.variables?.id === invoice.id &&
                              payMutation.variables?.gateway !== "paypal"
                            }
                            onClick={() =>
                              payMutation.mutate({ id: invoice.id })
                            }
                          >
                            {stripeOn ? "Pay by card" : "Pay now"}
                          </Button>
                          {paypalOn && (
                            <Button
                              size="sm"
                              variant="outline"
                              loading={
                                payMutation.isPending &&
                                payMutation.variables?.id === invoice.id &&
                                payMutation.variables?.gateway === "paypal"
                              }
                              onClick={() =>
                                payMutation.mutate({
                                  id: invoice.id,
                                  gateway: "paypal",
                                })
                              }
                            >
                              PayPal
                            </Button>
                          )}
                        </>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setViewId(invoice.id)}
                          >
                            <Eye className="size-4" /> View
                          </DropdownMenuItem>
                          {invoice.pdfUrl && (
                            <DropdownMenuItem
                              onClick={() => openPdf(invoice.pdfUrl!)}
                            >
                              <Download className="size-4" /> Download PDF
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <InvoiceDialog
        invoiceId={viewId}
        onClose={() => setViewId(null)}
        onPay={(id, gateway) => payMutation.mutate({ id, gateway })}
        paying={payMutation.isPending}
        paypalOn={paypalOn}
        stripeOn={stripeOn}
      />
    </>
  );
}

function InvoiceDialog({
  invoiceId,
  onClose,
  onPay,
  paying,
  paypalOn,
  stripeOn,
}: {
  invoiceId: string | null;
  onClose: () => void;
  onPay: (id: string, gateway?: "stripe" | "paypal") => void;
  paying: boolean;
  paypalOn: boolean;
  stripeOn: boolean;
}) {
  const { data: invoice, isLoading } = useQuery({
    queryKey: ["billing", "invoice", invoiceId],
    queryFn: () => api.billing.invoice(invoiceId!),
    enabled: !!invoiceId,
  });

  return (
    <Dialog open={!!invoiceId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Invoice {invoice?.number ?? ""}
            {invoice && (
              <Badge variant={invoiceStateMap[invoice.state].variant}>
                {invoiceStateMap[invoice.state].label}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {invoice?.dueAt
              ? `Due ${formatDate(invoice.dueAt)}`
              : invoice
                ? `Issued ${formatDate(invoice.createdAt)}`
                : "Loading invoice…"}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <ListSkeleton rows={3} />
        ) : invoice ? (
          <div className="space-y-4">
            {invoice.lineItems?.length ? (
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoice.lineItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {item.description}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {item.quantity}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMoney(item.amountMinor, invoice.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No line items on this invoice.
              </p>
            )}

            <div className="space-y-1.5 rounded-lg bg-muted/40 p-4 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>
                  {formatMoney(invoice.subtotalMinor, invoice.currency)}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Tax</span>
                <span>{formatMoney(invoice.taxMinor, invoice.currency)}</span>
              </div>
              <div className="flex justify-between border-t pt-1.5 font-semibold">
                <span>Total</span>
                <span>{formatMoney(invoice.totalMinor, invoice.currency)}</span>
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          {invoice?.pdfUrl && (
            <Button variant="outline" onClick={() => openPdf(invoice.pdfUrl!)}>
              <Download className="size-4" /> Download PDF
            </Button>
          )}
          {invoice?.state === "OPEN" && (
            <>
              <Button loading={paying} onClick={() => onPay(invoice.id)}>
                {stripeOn ? "Pay by card" : "Pay"}{" "}
                {formatMoney(invoice.totalMinor, invoice.currency)}
              </Button>
              {paypalOn && (
                <Button
                  variant="outline"
                  loading={paying}
                  onClick={() => onPay(invoice.id, "paypal")}
                >
                  PayPal
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

function SubscriptionsTab({
  subscriptions,
  isLoading,
}: {
  subscriptions?: Subscription[];
  isLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const [cancelTarget, setCancelTarget] = useState<Subscription | null>(null);
  const [atPeriodEnd, setAtPeriodEnd] = useState(true);

  const cancelMutation = useMutation({
    mutationFn: ({ id, atEnd }: { id: string; atEnd: boolean }) =>
      api.billing.cancelSubscription(id, atEnd),
    onSuccess: () => {
      toast.success("Subscription updated.");
      queryClient.invalidateQueries({ queryKey: ["billing", "subscriptions"] });
      setCancelTarget(null);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Failed to cancel subscription",
      ),
  });

  const resumeMutation = useMutation({
    mutationFn: (id: string) => api.billing.resumeSubscription(id),
    onSuccess: () => {
      toast.success("Subscription resumed.");
      queryClient.invalidateQueries({ queryKey: ["billing", "subscriptions"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Failed to resume subscription",
      ),
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-44" />
        ))}
      </div>
    );
  }

  if (!subscriptions?.length) {
    return (
      <EmptyState
        icon={Repeat}
        title="No subscriptions"
        description="Active subscriptions for your servers and add-ons will show up here."
      />
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {subscriptions.map((sub) => {
          const cfg = subStateMap[sub.state];
          const canResume = sub.cancelAtPeriodEnd && sub.state !== "CANCELED";
          const canCancel = !sub.cancelAtPeriodEnd && sub.state !== "CANCELED";
          return (
            <Card key={sub.id}>
              <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle>{sub.product?.name ?? "Subscription"}</CardTitle>
                    {sub.product?.type === "VOICE_SERVER" ? (
                      <Badge variant="outline" className="text-[10px]">
                        Voice
                      </Badge>
                    ) : sub.product?.type === "GAME_SERVER" ? (
                      <Badge variant="outline" className="text-[10px]">
                        Game
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {intervalLabel[sub.interval]}
                    {sub.hardwareTier ? ` · ${sub.hardwareTier.name}` : ""}
                    {sub.product?.perSlot && sub.slots
                      ? ` · ${sub.slots} slots`
                      : ""}
                  </p>
                </div>
                <Badge variant={cfg.variant}>{cfg.label}</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  {!!sub.renewalAmountMinor && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {sub.cancelAtPeriodEnd ? "Was" : "Renews for"}
                      </span>
                      <span className="font-medium">
                        {formatMoney(sub.renewalAmountMinor, sub.currency)}
                        <span className="text-muted-foreground">
                          {" "}
                          {intervalLabel[sub.interval]}
                        </span>
                        {sub.product?.perSlot && sub.slots ? (
                          <span className="text-xs text-muted-foreground">
                            {" "}
                            · {sub.slots} slots
                          </span>
                        ) : null}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <CalendarClock className="size-4" />
                      {sub.cancelAtPeriodEnd ? "Access until" : "Renews on"}
                    </span>
                    <span className="font-medium">
                      {formatDate(sub.currentPeriodEnd)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Renewal</span>
                    {sub.cancelAtPeriodEnd ? (
                      <Badge variant="warning">Cancels at period end</Badge>
                    ) : sub.autoRenew ? (
                      <Badge variant="success">Auto-renews</Badge>
                    ) : (
                      <Badge variant="muted">Manual</Badge>
                    )}
                  </div>
                  {!!sub.servers?.length && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Server</span>
                      <Link
                        href={`/servers/${sub.servers[0].id}/console`}
                        className="truncate font-medium text-primary hover:underline"
                      >
                        {sub.servers[0].name}
                      </Link>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  {canResume && (
                    <Button
                      variant="outline"
                      size="sm"
                      loading={
                        resumeMutation.isPending &&
                        resumeMutation.variables === sub.id
                      }
                      onClick={() => resumeMutation.mutate(sub.id)}
                    >
                      <RefreshCw className="size-4" /> Resume
                    </Button>
                  )}
                  {canCancel && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAtPeriodEnd(true);
                        setCancelTarget(sub);
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel subscription</DialogTitle>
            <DialogDescription>
              You&apos;re canceling{" "}
              <strong>
                {cancelTarget?.product?.name ?? "this subscription"}
              </strong>
              .
            </DialogDescription>
          </DialogHeader>

          <label className="flex items-start gap-3 rounded-lg border p-3">
            <div className="flex-1">
              <p className="text-sm font-medium">Cancel at period end</p>
              <p className="text-xs text-muted-foreground">
                {atPeriodEnd
                  ? `Stays active until ${cancelTarget ? formatDate(cancelTarget.currentPeriodEnd) : "the period ends"}, then stops.`
                  : "Cancels immediately. The associated service may be suspended right away."}
              </p>
            </div>
            <Switch checked={atPeriodEnd} onCheckedChange={setAtPeriodEnd} />
          </label>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>
              Keep subscription
            </Button>
            <Button
              variant="destructive"
              loading={cancelMutation.isPending}
              onClick={() =>
                cancelTarget &&
                cancelMutation.mutate({
                  id: cancelTarget.id,
                  atEnd: atPeriodEnd,
                })
              }
            >
              Cancel subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Payment methods
// ---------------------------------------------------------------------------

function PaymentMethodsTab({
  methods,
  isLoading,
}: {
  methods?: PaymentMethod[];
  isLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const [removeTarget, setRemoveTarget] = useState<PaymentMethod | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const refetchMethods = () =>
    queryClient.invalidateQueries({ queryKey: ["billing", "payment-methods"] });

  const defaultMutation = useMutation({
    mutationFn: (id: string) => api.billing.setDefaultPaymentMethod(id),
    onSuccess: () => {
      toast.success("Default payment method updated.");
      queryClient.invalidateQueries({
        queryKey: ["billing", "payment-methods"],
      });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to set default"),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.billing.removePaymentMethod(id),
    onSuccess: () => {
      toast.success("Payment method removed.");
      queryClient.invalidateQueries({
        queryKey: ["billing", "payment-methods"],
      });
      setRemoveTarget(null);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to remove"),
  });

  return (
    <div className="space-y-4">
      <AddCardDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={refetchMethods}
      />
      <div className="flex justify-end">
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="size-4" /> Add payment method
        </Button>
      </div>

      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : !methods?.length ? (
        <EmptyState
          icon={CreditCard}
          title="No payment methods"
          description="Add a card to enable automatic renewals and one-click checkout."
          action={
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="size-4" /> Add payment method
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {methods.map((pm) => (
            <Card key={pm.id}>
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                    <CreditCard className="size-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="flex items-center gap-2 font-medium capitalize">
                      {pm.brand ?? pm.gateway} •••• {pm.last4 ?? "————"}
                      {pm.isDefault && <Badge variant="default">Default</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {pm.expMonth && pm.expYear
                        ? `Expires ${String(pm.expMonth).padStart(2, "0")}/${pm.expYear}`
                        : "No expiry on file"}
                    </p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {!pm.isDefault && (
                      <DropdownMenuItem
                        onClick={() => defaultMutation.mutate(pm.id)}
                      >
                        <Star className="size-4" /> Set as default
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      destructive
                      onClick={() => setRemoveTarget(pm)}
                    >
                      <Trash2 className="size-4" /> Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove payment method</DialogTitle>
            <DialogDescription>
              Remove the {removeTarget?.brand ?? "card"} ending in{" "}
              {removeTarget?.last4 ?? "————"}? Subscriptions using it may fail
              to renew.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoveTarget(null)}>
              Keep
            </Button>
            <Button
              variant="destructive"
              loading={removeMutation.isPending}
              onClick={() =>
                removeTarget && removeMutation.mutate(removeTarget.id)
              }
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
