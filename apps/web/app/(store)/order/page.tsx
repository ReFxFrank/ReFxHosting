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
  Gamepad2,
  Mic,
  Users,
  Check,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/shared";
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
import type { BillingInterval, HardwareTier, Price, Product } from "@/lib/types";

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

// A product is a VOICE offering purely by its type (drives grouping + icon).
// Its CONFIGURATION model (tier cards vs slot slider) is independent: that's the
// billing model. A game can still be per-slot (legacy) and stays a game server.
const isVoiceType = (p: Product) => p.type === "VOICE_SERVER";
const isPerSlot = (p: Product) => p.billingModel === "PER_SLOT" || p.perSlot;
const hasActiveTiers = (p: Product) =>
  (p.hardwareTiers ?? []).some((t) => t.isActive !== false);

function sortPrices(prices: Price[]) {
  return [...prices]
    .filter((p) => p.isActive !== false)
    .sort((a, b) => INTERVAL_ORDER.indexOf(a.interval) - INTERVAL_ORDER.indexOf(b.interval));
}

export default function OrderPage() {
  const router = useRouter();

  const productsQ = useQuery({
    queryKey: ["catalog", "products", "tiers"],
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

  // Orderable offerings: any active product bound to a template that is either
  // hardware-tier (has active tiers) or per-slot. Grouped by type below.
  const offerings = useMemo(
    () =>
      (productsQ.data ?? []).filter(
        (p) =>
          p.isActive &&
          p.gameTemplateId &&
          (hasActiveTiers(p) || isPerSlot(p)),
      ),
    [productsQ.data],
  );
  const gameOfferings = useMemo(() => offerings.filter((p) => !isVoiceType(p)), [offerings]);
  const voiceOfferings = useMemo(() => offerings.filter((p) => isVoiceType(p)), [offerings]);

  const [productId, setProductId] = useState<string | null>(null);
  const [tierId, setTierId] = useState<string | null>(null);
  const [slots, setSlots] = useState(1);
  const [interval, setIntervalState] = useState<BillingInterval | null>(null);
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

  const product = offerings.find((p) => p.id === productId) ?? null;
  // voiceType drives grouping/icon/labels; perSlot drives the configuration UI.
  const voiceType = product ? isVoiceType(product) : false;
  const perSlot = product ? isPerSlot(product) : false;
  const tiers = useMemo(
    () =>
      (product?.hardwareTiers ?? [])
        .filter((t) => t.isActive !== false)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [product],
  );
  const tier = perSlot ? null : tiers.find((t) => t.id === tierId) ?? null;
  const template = product ? templatesById[product.gameTemplateId ?? ""] : null;
  const configVars = (template?.variables ?? []).filter(
    (v) => v.userEditable && v.type !== "SECRET",
  );
  const setConfigVal = (k: string, v: string) =>
    setConfig((c) => ({ ...c, [k]: v }));

  // The price list to choose a billing interval from: tier prices (game) or
  // product prices (voice).
  const sortedPriceList = useMemo(
    () => sortPrices(perSlot ? product?.prices ?? [] : tier?.prices ?? []),
    [perSlot, product, tier],
  );
  const price = interval
    ? sortedPriceList.find((p) => p.interval === interval) ?? null
    : null;

  // Deep link: /order?game=<template-slug> or /order?product=<slug>
  const presetApplied = useRef(false);
  useEffect(() => {
    if (presetApplied.current || !offerings.length) return;
    const params = new URLSearchParams(window.location.search);
    const productSlug = params.get("product");
    const gameSlug = params.get("game");
    if (productSlug) {
      const m = offerings.find((p) => p.slug === productSlug);
      if (m) setProductId(m.id);
    } else if (gameSlug) {
      const m = offerings.find(
        (p) => templatesById[p.gameTemplateId ?? ""]?.slug === gameSlug,
      );
      if (m) setProductId(m.id);
    }
    presetApplied.current = true;
  }, [offerings, templatesById]);

  // When the chosen offering changes, reset its dependent selections + default
  // the tier to the recommended one (game) and the slots to the minimum (voice).
  useEffect(() => {
    if (!product) return;
    setRegionId(null);
    setNodeId(null);
    if (isPerSlot(product)) {
      setTierId(null);
      setSlots((s) => clampSlots(s, product));
    } else {
      const list = (product.hardwareTiers ?? [])
        .filter((t) => t.isActive !== false)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const rec = list.find((t) => t.isRecommended) ?? list[0] ?? null;
      setTierId(rec?.id ?? null);
    }
  }, [product]);

  // Default / re-validate the interval whenever the price list changes.
  useEffect(() => {
    const ints = sortedPriceList.map((p) => p.interval);
    setIntervalState((cur) =>
      cur && ints.includes(cur)
        ? cur
        : ints.includes("MONTHLY")
        ? "MONTHLY"
        : ints[0] ?? null,
    );
  }, [sortedPriceList]);

  // Seed per-game config fields from their defaults when the template loads.
  useEffect(() => {
    if (!product) return;
    const tpl = templatesById[product.gameTemplateId ?? ""];
    const defaults: Record<string, string> = {};
    for (const v of tpl?.variables ?? []) {
      if (v.userEditable && v.type !== "SECRET") defaults[v.envName] = v.defaultValue ?? "";
    }
    setConfig(defaults);
  }, [product, templatesById]);

  // Reserved resources drive the location/node capacity check.
  const limits = !product
    ? null
    : perSlot
    ? {
        cpuCores: +(product.cpuPerSlot * slots).toFixed(2),
        memoryMb: product.memoryMbPerSlot * slots,
        diskMb: product.diskMbPerSlot * slots,
      }
    : tier
    ? { cpuCores: tier.cpuCores, memoryMb: tier.memoryMb, diskMb: tier.diskMb }
    : null;

  const locationsQ = useQuery({
    queryKey: ["catalog", "locations", limits?.cpuCores, limits?.memoryMb, limits?.diskMb],
    queryFn: () => api.catalog.locations(limits!),
    enabled: !!limits,
  });
  const nodesQ = useQuery({
    queryKey: ["catalog", "nodes", regionId, limits?.cpuCores, limits?.memoryMb, limits?.diskMb],
    queryFn: () => api.catalog.nodes(regionId!, limits!),
    enabled: !!regionId && !!limits,
  });
  useEffect(() => {
    setNodeId(null);
  }, [regionId]);

  // Pricing preview (the backend recomputes authoritatively, incl. tax).
  const quantity = perSlot ? slots : 1;
  const subtotalMinor = price ? price.amountMinor * quantity : 0;
  const discountMinor = coupon ? Math.min(coupon.discountMinor, subtotalMinor) : 0;
  const afterDiscount = Math.max(0, subtotalMinor - discountMinor);
  const giftCredit = gift ? Math.min(gift.balanceMinor, afterDiscount) : 0;
  const afterGift = Math.max(0, afterDiscount - giftCredit);
  const creditBalance = creditQ.data?.balanceMinor ?? 0;
  const creditUsed = useCredit ? Math.min(creditBalance, afterGift) : 0;
  const dueTodayMinor = Math.max(0, afterGift - creditUsed);
  const currency = price?.currency ?? "USD";

  // A coupon discount depends on the subtotal, so clear it if it changes.
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
        hardwareTierId: perSlot ? undefined : tier?.id,
        slots: perSlot ? slots : undefined,
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
    !!product &&
    !!price &&
    !!name.trim() &&
    (perSlot ? slots > 0 : !!tier) &&
    (!(locationsQ.data?.length) || !!regionId);

  if (productsQ.isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Order a server" description="Pick a product, configure it, go live." />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!offerings.length) {
    return (
      <div className="space-y-4">
        <PageHeader title="Order a server" description="Pick a product, configure it, go live." />
        <EmptyState
          icon={ServerIcon}
          title="No plans available yet"
          description="An admin needs to create a game product with hardware tiers, or a voice product (Admin → Products)."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Order a server" description="Choose a product, configure it, and you're live in minutes." />

      {/* Step 1 — choose an offering (game or voice) */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">1 · Choose a product</h2>

        {gameOfferings.length > 0 && (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Gamepad2 className="size-3.5" /> Game servers
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {gameOfferings.map((g) => (
                <OfferingCard
                  key={g.id}
                  product={g}
                  active={g.id === productId}
                  icon={templatesById[g.gameTemplateId ?? ""]?.iconUrl || templatesById[g.gameTemplateId ?? ""]?.cardImageUrl}
                  onSelect={() => setProductId(g.id)}
                />
              ))}
            </div>
          </div>
        )}

        {voiceOfferings.length > 0 && (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Mic className="size-3.5" /> Voice servers
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {voiceOfferings.map((g) => (
                <OfferingCard
                  key={g.id}
                  product={g}
                  active={g.id === productId}
                  icon={templatesById[g.gameTemplateId ?? ""]?.iconUrl}
                  onSelect={() => setProductId(g.id)}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {product && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            {/* Step 2 — hardware tiers (tiered) OR slot selector (per-slot) */}
            {!perSlot ? (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold">2 · Choose a hardware tier</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {tiers.map((t) => (
                    <TierCard
                      key={t.id}
                      tier={t}
                      active={t.id === tierId}
                      currency={currency}
                      interval={interval}
                      onSelect={() => setTierId(t.id)}
                    />
                  ))}
                </div>
              </section>
            ) : (
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
                {price && (
                  <p className="text-xs text-muted-foreground">
                    {formatMoney(price.amountMinor, currency)} / slot ·{" "}
                    {interval ? INTERVAL_LABEL[interval].toLowerCase() : ""}
                  </p>
                )}
              </section>
            )}

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

            {/* Step 3 — billing duration */}
            <section className="space-y-3 rounded-xl border p-4">
              <h2 className="text-sm font-semibold">3 · Billing duration</h2>
              {sortedPriceList.length ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {sortedPriceList.map((p) => {
                    const active = p.interval === interval;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setIntervalState(p.interval)}
                        className={cn(
                          "rounded-lg border p-3 text-left transition-colors",
                          active ? "border-primary bg-primary/5" : "hover:bg-accent/40",
                        )}
                      >
                        <p className="font-medium">{INTERVAL_LABEL[p.interval]}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatMoney(p.amountMinor * quantity, p.currency)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {perSlot ? "This product has no pricing yet." : "Select a tier to see pricing."}
                </p>
              )}
            </section>

            {/* Step 4 — location + node */}
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
                        No nodes with capacity here — try another region.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No locations currently have capacity for this size{perSlot ? " — try fewer slots." : "."}
                </p>
              )}
            </section>

            {/* Step 5 — name */}
            <section className="space-y-2 rounded-xl border p-4">
              <Label htmlFor="srv-name">5 · Server name</Label>
              <Input
                id="srv-name"
                placeholder={voiceType ? "My community voice" : "My awesome server"}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </section>
          </div>

          {/* Summary */}
          <aside className="lg:sticky lg:top-6 h-fit space-y-3 rounded-xl border p-4">
            <h2 className="text-sm font-semibold">Summary</h2>
            <Row label="Product" value={product.name} />
            <Row label="Type" value={voiceType ? "Voice server" : "Game server"} />
            {perSlot ? (
              <Row label="Slots" value={String(slots)} />
            ) : (
              <Row label="Tier" value={tier?.name ?? "—"} />
            )}
            {limits && (
              <Row
                label="Resources"
                value={`${limits.cpuCores} vCPU · ${(limits.memoryMb / 1024).toFixed(1)} GB · ${(limits.diskMb / 1024).toFixed(0)} GB`}
              />
            )}
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

/** Cheapest active price across a product's prices (per-slot) or tiers (tiered). */
function fromPrice(product: Product): Price | null {
  const all = isPerSlot(product)
    ? product.prices ?? []
    : (product.hardwareTiers ?? []).flatMap((t) => t.prices ?? []);
  const active = all.filter((p) => p.isActive !== false);
  if (!active.length) return null;
  return active.reduce((a, b) => (b.amountMinor < a.amountMinor ? b : a));
}

function OfferingCard({
  product,
  active,
  icon,
  onSelect,
}: {
  product: Product;
  active: boolean;
  icon?: string | null;
  onSelect: () => void;
}) {
  const from = fromPrice(product);
  const voiceType = isVoiceType(product);
  const perSlot = isPerSlot(product);
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
        active ? "border-primary bg-primary/5" : "hover:bg-accent/40",
      )}
    >
      {voiceType ? (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-white/5">
          <Mic className="size-6 text-muted-foreground" />
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={icon || "/games/presets/default.svg"}
          alt=""
          className="size-12 shrink-0 rounded-lg bg-white/5 object-cover"
        />
      )}
      <div className="min-w-0">
        <p className="truncate font-semibold">{product.name}</p>
        {from && (
          <p className="text-xs text-muted-foreground">
            from {formatMoney(from.amountMinor, from.currency)}
            {perSlot ? "/slot" : ""}
          </p>
        )}
      </div>
    </button>
  );
}

function TierCard({
  tier,
  active,
  currency,
  interval,
  onSelect,
}: {
  tier: HardwareTier;
  active: boolean;
  currency: string;
  interval: BillingInterval | null;
  onSelect: () => void;
}) {
  // Show the price for the selected interval if present, else the cheapest.
  const sorted = sortPrices(tier.prices);
  const shown =
    (interval ? sorted.find((p) => p.interval === interval) : null) ?? sorted[0] ?? null;
  return (
    <button
      onClick={onSelect}
      className={cn(
        "relative flex flex-col gap-3 rounded-xl border p-4 text-left transition-colors",
        active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent/40",
      )}
    >
      <div className="flex items-center justify-between">
        <p className="font-semibold">{tier.name}</p>
        {tier.isRecommended && (
          <Badge className="text-[10px]" variant="secondary">Recommended</Badge>
        )}
      </div>
      {tier.description && (
        <p className="text-xs text-muted-foreground">{tier.description}</p>
      )}
      <div className="space-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><MemoryStick className="size-3.5" /> {(tier.memoryMb / 1024).toFixed(tier.memoryMb % 1024 ? 1 : 0)} GB RAM</span>
        <span className="flex items-center gap-1.5"><Cpu className="size-3.5" /> {tier.cpuCores} vCPU</span>
        <span className="flex items-center gap-1.5"><HardDrive className="size-3.5" /> {(tier.diskMb / 1024).toFixed(0)} GB disk</span>
        {tier.recommendedPlayers != null && (
          <span className="flex items-center gap-1.5"><Users className="size-3.5" /> ~{tier.recommendedPlayers} players</span>
        )}
      </div>
      <div className="mt-auto flex items-center justify-between pt-1">
        <span className="text-sm font-semibold">
          {shown ? formatMoney(shown.amountMinor, shown.currency) : "—"}
          {shown && (
            <span className="text-xs font-normal text-muted-foreground">
              /{INTERVAL_LABEL[shown.interval].toLowerCase()}
            </span>
          )}
        </span>
        {active && <Check className="size-4 text-primary" />}
      </div>
    </button>
  );
}

function clampSlots(s: number, product: Product) {
  const min = product.minSlots || 1;
  const max = product.maxSlots || 100;
  if (s < min) return min;
  if (s > max) return max;
  return s;
}
