"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Cpu,
  MemoryStick,
  HardDrive,
  ShoppingCart,
  Server as ServerIcon,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { cn, formatMoney } from "@/lib/utils";
import type { Product, BillingInterval } from "@/lib/types";

const INTERVAL_LABEL: Record<BillingInterval, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Biweekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  SEMIANNUAL: "6 months",
  ANNUAL: "Yearly",
};
const INTERVAL_ORDER: BillingInterval[] = [
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "ANNUAL",
];

export default function OrderPage() {
  const router = useRouter();

  const productsQ = useQuery({
    queryKey: ["catalog", "products", "perslot"],
    queryFn: () => api.catalog.products(),
  });
  const templatesQ = useQuery({
    queryKey: ["catalog", "templates", "all"],
    queryFn: () => api.catalog.templates(),
  });
  const payCfg = useQuery({
    queryKey: ["billing", "config"],
    queryFn: () => api.billing.config(),
    retry: false,
  });
  const creditQ = useQuery({
    queryKey: ["billing", "credit"],
    queryFn: () => api.billing.credit(),
    retry: false,
  });

  const templatesById = useMemo(
    () => Object.fromEntries((templatesQ.data ?? []).map((t) => [t.id, t])),
    [templatesQ.data],
  );
  const games = useMemo(
    () => (productsQ.data ?? []).filter((p) => p.perSlot && p.isActive && p.gameTemplateId),
    [productsQ.data],
  );

  const [productId, setProductId] = useState<string | null>(null);
  const [slots, setSlots] = useState(1);
  const [interval, setInterval] = useState<BillingInterval | null>(null);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [gateway, setGateway] = useState<"stripe" | "paypal">("stripe");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discountMinor: number } | null>(null);
  const [giftInput, setGiftInput] = useState("");
  const [gift, setGift] = useState<{ code: string; balanceMinor: number } | null>(null);
  const [useCredit, setUseCredit] = useState(false);

  const product = games.find((p) => p.id === productId) ?? null;
  const template = product ? templatesById[product.gameTemplateId ?? ""] : null;
  const configVars = (template?.variables ?? []).filter(
    (v) => v.userEditable && v.type !== "SECRET",
  );
  const setConfigVal = (k: string, v: string) =>
    setConfig((c) => ({ ...c, [k]: v }));

  // Deep link: /order?game=<template-slug>
  const presetApplied = useRef(false);
  useEffect(() => {
    if (presetApplied.current || !games.length) return;
    const slug = new URLSearchParams(window.location.search).get("game");
    if (slug) {
      const match = games.find((p) => templatesById[p.gameTemplateId ?? ""]?.slug === slug);
      if (match) setProductId(match.id);
    }
    presetApplied.current = true;
  }, [games, templatesById]);

  // When the chosen game changes, reset its dependent selections.
  useEffect(() => {
    if (!product) return;
    setSlots((s) => clampSlots(s, product));
    setInterval((cur) => {
      const ints = sortedPrices(product).map((p) => p.interval);
      return cur && ints.includes(cur) ? cur : (ints[0] ?? null);
    });
    setRegionId(null);
    setNodeId(null);
  }, [product]);

  // Seed per-game config fields from their defaults when the game/template loads.
  useEffect(() => {
    if (!product) return;
    const tpl = templatesById[product.gameTemplateId ?? ""];
    const defaults: Record<string, string> = {};
    for (const v of tpl?.variables ?? []) {
      if (v.userEditable && v.type !== "SECRET") defaults[v.envName] = v.defaultValue ?? "";
    }
    setConfig(defaults);
  }, [product, templatesById]);

  const price = product && interval
    ? product.prices.find((p) => p.interval === interval) ?? null
    : null;

  const limits = product
    ? {
        cpuCores: +(product.cpuPerSlot * slots).toFixed(2),
        memoryMb: product.memoryMbPerSlot * slots,
        diskMb: product.diskMbPerSlot * slots,
      }
    : null;

  const locationsQ = useQuery({
    queryKey: ["catalog", "locations", limits?.cpuCores, limits?.memoryMb, limits?.diskMb],
    queryFn: () => api.catalog.locations(limits!),
    enabled: !!limits,
  });

  // Nodes in the chosen region with capacity (lets the customer pick a specific
  // node, or leave it on Auto for the scheduler to choose the best one).
  const nodesQ = useQuery({
    queryKey: ["catalog", "nodes", regionId, limits?.cpuCores, limits?.memoryMb, limits?.diskMb],
    queryFn: () => api.catalog.nodes(regionId!, limits!),
    enabled: !!regionId && !!limits,
  });
  // Changing region invalidates the node choice.
  useEffect(() => {
    setNodeId(null);
  }, [regionId]);

  // Pricing preview (the backend recomputes authoritatively, incl. tax).
  const subtotalMinor = price ? price.amountMinor * slots : 0;
  const discountMinor = coupon ? Math.min(coupon.discountMinor, subtotalMinor) : 0;
  const afterDiscount = Math.max(0, subtotalMinor - discountMinor);
  const giftCredit = gift ? Math.min(gift.balanceMinor, afterDiscount) : 0;
  const afterGift = Math.max(0, afterDiscount - giftCredit);
  const creditBalance = creditQ.data?.balanceMinor ?? 0;
  const creditUsed = useCredit ? Math.min(creditBalance, afterGift) : 0;
  const dueTodayMinor = Math.max(0, afterGift - creditUsed);
  const currency = price?.currency ?? "USD";

  // A coupon discount depends on the subtotal, so clear it if slots/price change.
  useEffect(() => {
    setCoupon(null);
  }, [subtotalMinor]);

  const applyCoupon = useMutation({
    mutationFn: () => api.billing.validateCoupon(couponInput.trim(), subtotalMinor),
    onSuccess: (res) => {
      setCoupon({ code: res.code, discountMinor: res.discountMinor });
      toast.success(`Coupon ${res.code} applied`);
    },
    onError: (e) => {
      setCoupon(null);
      toast.error(e instanceof ApiError ? e.message : "Invalid coupon");
    },
  });

  const applyGift = useMutation({
    mutationFn: () => api.billing.lookupGiftCard(giftInput.trim()),
    onSuccess: (res) => {
      setGift({ code: res.code, balanceMinor: res.balanceMinor });
      toast.success(`Gift card applied — ${formatMoney(res.balanceMinor, res.currency)} balance`);
    },
    onError: (e) => {
      setGift(null);
      toast.error(e instanceof ApiError ? e.message : "Invalid gift card");
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.orders.create({
        productId: product!.id,
        priceId: price!.id,
        templateId: product!.gameTemplateId!,
        slots,
        regionId: regionId ?? undefined,
        nodeId: nodeId ?? undefined,
        name: name.trim(),
        gateway,
        environment: Object.keys(config).length ? config : undefined,
        couponCode: coupon?.code,
        giftCardCode: gift?.code,
        useCredit: useCredit && creditBalance > 0 ? true : undefined,
      }),
    onSuccess: (res) => {
      if (res?.checkoutUrl) {
        window.location.assign(res.checkoutUrl);
        return;
      }
      if (res?.paid) {
        toast.success("Order placed — your server is provisioning.");
        router.push("/servers");
        return;
      }
      toast.success("Order placed. Complete payment in Billing to start your server.");
      router.push("/billing");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to place order"),
  });

  const stripeOn = !!payCfg.data?.stripe.configured;
  const paypalOn = !!payCfg.data?.paypal.configured;
  const canOrder =
    !!product && !!price && !!name.trim() && slots > 0 &&
    (!(locationsQ.data?.length) || !!regionId);

  if (productsQ.isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Order a game server" description="Pick a game, configure it, go live." />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!games.length) {
    return (
      <div className="space-y-4">
        <PageHeader title="Order a game server" description="Pick a game, configure it, go live." />
        <EmptyState
          icon={ServerIcon}
          title="No game plans available yet"
          description="An admin needs to create a per-slot product (Admin → Products) and publish pricing."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Order a game server" description="Pick a game, choose your size, and you're live in minutes." />

      {/* Step 1 — game */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">1 · Choose a game</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((g) => {
            const tpl = templatesById[g.gameTemplateId ?? ""];
            const from = sortedPrices(g)[0];
            const active = g.id === productId;
            return (
              <button
                key={g.id}
                onClick={() => setProductId(g.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                  active ? "border-primary bg-primary/5" : "hover:bg-accent/40",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={tpl?.iconUrl || tpl?.cardImageUrl || "/games/presets/default.svg"}
                  alt=""
                  className="size-12 shrink-0 rounded-lg bg-white/5 object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{g.name}</p>
                  {from && (
                    <p className="text-xs text-muted-foreground">
                      from {formatMoney(from.amountMinor, from.currency)}/slot ·{" "}
                      {INTERVAL_LABEL[from.interval].toLowerCase()}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {product && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            {/* Slots */}
            <section className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">2 · Slots</h2>
                <Badge variant="secondary" className="text-sm">{slots} slots</Badge>
              </div>
              <Slider
                value={slots}
                min={product.minSlots}
                max={product.maxSlots}
                step={product.slotStep || 1}
                onChange={setSlots}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{product.minSlots}</span>
                <span>{product.maxSlots}</span>
              </div>
              {limits && (
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Cpu className="size-3.5" /> {limits.cpuCores} vCPU</span>
                  <span className="inline-flex items-center gap-1"><MemoryStick className="size-3.5" /> {(limits.memoryMb / 1024).toFixed(1)} GB RAM</span>
                  <span className="inline-flex items-center gap-1"><HardDrive className="size-3.5" /> {(limits.diskMb / 1024).toFixed(1)} GB disk</span>
                </div>
              )}
            </section>

            {/* Per-game configuration (user-editable template variables) */}
            {configVars.length > 0 && (
              <section className="space-y-3 rounded-xl border p-4">
                <h2 className="text-sm font-semibold">Configuration</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {configVars.map((v) => {
                    const options = Array.isArray(v.rules?.options)
                      ? (v.rules.options as unknown[]).map(String)
                      : null;
                    return (
                      <div key={v.id} className="space-y-1.5">
                        <Label>{v.displayName}</Label>
                        {v.type === "BOOLEAN" ? (
                          <div className="flex h-9 items-center">
                            <Switch
                              checked={config[v.envName] === "true"}
                              onCheckedChange={(c: boolean) =>
                                setConfigVal(v.envName, c ? "true" : "false")
                              }
                            />
                          </div>
                        ) : v.type === "ENUM" && options ? (
                          <Select
                            value={config[v.envName] ?? ""}
                            onValueChange={(val) => setConfigVal(v.envName, val)}
                          >
                            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                            <SelectContent>
                              {options.map((o) => (
                                <SelectItem key={o} value={o}>{o}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type={v.type === "NUMBER" ? "number" : "text"}
                            value={config[v.envName] ?? ""}
                            onChange={(e) => setConfigVal(v.envName, e.target.value)}
                          />
                        )}
                        {v.description && (
                          <p className="text-xs text-muted-foreground">{v.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Duration */}
            <section className="space-y-3 rounded-xl border p-4">
              <h2 className="text-sm font-semibold">3 · Billing duration</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {sortedPrices(product).map((p) => {
                  const active = p.interval === interval;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setInterval(p.interval)}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-colors",
                        active ? "border-primary bg-primary/5" : "hover:bg-accent/40",
                      )}
                    >
                      <p className="font-medium">{INTERVAL_LABEL[p.interval]}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatMoney(p.amountMinor * slots, p.currency)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Location + node */}
            <section className="space-y-3 rounded-xl border p-4">
              <h2 className="text-sm font-semibold">4 · Location</h2>
              {locationsQ.isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : locationsQ.data?.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Region</Label>
                    <Select value={regionId ?? ""} onValueChange={setRegionId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a region…" />
                      </SelectTrigger>
                      <SelectContent>
                        {locationsQ.data.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                            {r.country ? ` · ${r.country}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Node</Label>
                    <Select
                      value={nodeId ?? "auto"}
                      onValueChange={(v) => setNodeId(v === "auto" ? null : v)}
                      disabled={!regionId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={regionId ? "Auto (best available)" : "Pick a region first"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto (best available)</SelectItem>
                        {(nodesQ.data ?? []).map((n) => (
                          <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {regionId && !nodesQ.isLoading && (nodesQ.data?.length ?? 0) === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No nodes with capacity here — try another region or fewer slots.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No locations currently have capacity for this size — try fewer slots.
                </p>
              )}
            </section>

            {/* Name */}
            <section className="space-y-2 rounded-xl border p-4">
              <Label htmlFor="srv-name">5 · Server name</Label>
              <Input
                id="srv-name"
                placeholder="My awesome server"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </section>
          </div>

          {/* Summary */}
          <aside className="lg:sticky lg:top-6 h-fit space-y-3 rounded-xl border p-4">
            <h2 className="text-sm font-semibold">Summary</h2>
            <Row label="Game" value={product.name} />
            <Row label="Slots" value={String(slots)} />
            <Row label="Duration" value={interval ? INTERVAL_LABEL[interval] : "—"} />
            <Row
              label="Location"
              value={locationsQ.data?.find((r) => r.id === regionId)?.name ?? "Auto"}
            />

            {/* Coupon */}
            <div className="space-y-1.5 border-t pt-3">
              <Label className="text-xs">Coupon code</Label>
              {coupon ? (
                <div className="flex items-center justify-between rounded-md border border-success/40 bg-success/5 px-2.5 py-1.5 text-sm">
                  <span className="font-mono">{coupon.code}</span>
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => { setCoupon(null); setCouponInput(""); }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    placeholder="WELCOME10"
                    className="h-9 font-mono uppercase"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    loading={applyCoupon.isPending}
                    disabled={!couponInput.trim()}
                    onClick={() => applyCoupon.mutate()}
                  >
                    Apply
                  </Button>
                </div>
              )}
            </div>

            {/* Gift card */}
            <div className="space-y-1.5">
              <Label className="text-xs">Gift card</Label>
              {gift ? (
                <div className="flex items-center justify-between rounded-md border border-success/40 bg-success/5 px-2.5 py-1.5 text-sm">
                  <span className="font-mono">{gift.code}</span>
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => { setGift(null); setGiftInput(""); }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={giftInput}
                    onChange={(e) => setGiftInput(e.target.value)}
                    placeholder="GIFT-…"
                    className="h-9 font-mono uppercase"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    loading={applyGift.isPending}
                    disabled={!giftInput.trim()}
                    onClick={() => applyGift.mutate()}
                  >
                    Apply
                  </Button>
                </div>
              )}
            </div>

            {/* Account credit */}
            {creditBalance > 0 && (
              <div className="flex items-center justify-between rounded-md border px-2.5 py-1.5">
                <div className="text-sm">
                  <span>Use account credit</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatMoney(creditBalance, currency)} available
                  </span>
                </div>
                <Switch checked={useCredit} onCheckedChange={setUseCredit} />
              </div>
            )}

            <div className="space-y-1 border-t pt-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatMoney(subtotalMinor, currency)}</span>
              </div>
              {discountMinor > 0 && (
                <div className="flex justify-between text-success">
                  <span>Discount</span>
                  <span>−{formatMoney(discountMinor, currency)}</span>
                </div>
              )}
              {giftCredit > 0 && (
                <div className="flex justify-between text-success">
                  <span>Gift card</span>
                  <span>−{formatMoney(giftCredit, currency)}</span>
                </div>
              )}
              {creditUsed > 0 && (
                <div className="flex justify-between text-success">
                  <span>Account credit</span>
                  <span>−{formatMoney(creditUsed, currency)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1 font-medium">
                <span>Due today</span>
                <span className="text-lg font-semibold">
                  {price ? formatMoney(dueTodayMinor, currency) : "—"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">Tax (if any) is added at checkout.</p>
            </div>

            {paypalOn && stripeOn && (
              <div className="space-y-1.5">
                <Label className="text-xs">Payment method</Label>
                <div className="flex gap-2">
                  <Button size="sm" variant={gateway === "stripe" ? "default" : "outline"} onClick={() => setGateway("stripe")}>Card</Button>
                  <Button size="sm" variant={gateway === "paypal" ? "default" : "outline"} onClick={() => setGateway("paypal")}>PayPal</Button>
                </div>
              </div>
            )}

            <Button
              className="w-full"
              loading={createMutation.isPending}
              disabled={!canOrder}
              onClick={() => createMutation.mutate()}
            >
              <ShoppingCart className="size-4" /> Complete order
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              You&apos;ll be redirected to secure checkout. Your server provisions once
              payment clears.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function sortedPrices(product: Product) {
  return [...product.prices]
    .filter((p) => p.isActive !== false)
    .sort((a, b) => INTERVAL_ORDER.indexOf(a.interval) - INTERVAL_ORDER.indexOf(b.interval));
}

function clampSlots(s: number, product: Product) {
  const min = product.minSlots || 1;
  const max = product.maxSlots || 100;
  if (s < min) return min;
  if (s > max) return max;
  return s;
}
