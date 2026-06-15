"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Gamepad2,
  Check,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  ShoppingCart,
  Server as ServerIcon,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { cn, formatMoney, formatMb } from "@/lib/utils";
import type {
  Product,
  Price,
  GameTemplate,
  BillingInterval,
} from "@/lib/types";

const STEPS = [
  { id: 1, label: "Choose a plan" },
  { id: 2, label: "Pick your game" },
  { id: 3, label: "Billing interval" },
  { id: 4, label: "Review & checkout" },
] as const;

const intervalLabel: Record<BillingInterval, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  SEMIANNUAL: "Every 6 months",
  ANNUAL: "Annually",
};

// Approx. number of months covered by each interval — used for per-month math.
const intervalMonths: Record<BillingInterval, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12,
};

const intervalOrder: BillingInterval[] = [
  "MONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "ANNUAL",
];

function lowestPrice(prices: Price[]): Price | undefined {
  if (!prices.length) return undefined;
  return prices.reduce((min, p) =>
    p.amountMinor / intervalMonths[p.interval] <
    min.amountMinor / intervalMonths[min.interval]
      ? p
      : min,
  );
}

export default function OrderPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  const [product, setProduct] = useState<Product | null>(null);
  const [template, setTemplate] = useState<GameTemplate | null>(null);
  const [price, setPrice] = useState<Price | null>(null);
  const [serverName, setServerName] = useState("");

  const products = useQuery({
    queryKey: ["catalog", "products", "GAME_SERVER"],
    queryFn: () => api.catalog.products({ type: "GAME_SERVER" }),
  });

  // Deep-link preselection from the public storefront: /order?game=<slug>&plan=<slug>.
  // Read from window (avoids the useSearchParams Suspense requirement on this
  // fully client, auth-gated page).
  const templates = useQuery({
    queryKey: ["catalog", "templates", "all"],
    queryFn: () => api.catalog.templates(),
  });
  const [preset, setPreset] = useState<{ game?: string; plan?: string }>({});
  const presetApplied = useRef(false);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setPreset({ game: sp.get("game") ?? undefined, plan: sp.get("plan") ?? undefined });
  }, []);
  useEffect(() => {
    if (presetApplied.current) return;
    if (!preset.game && !preset.plan) return;
    if (preset.plan && !products.data) return;
    if (preset.game && !templates.data) return;

    if (preset.plan && products.data) {
      const p = products.data.find((x) => x.slug === preset.plan);
      if (p) setProduct(p);
    }
    if (preset.game && templates.data) {
      const t = templates.data.find((x) => x.slug === preset.game);
      if (t) setTemplate(t);
    }
    presetApplied.current = true;
  }, [preset, products.data, templates.data]);

  const createMutation = useMutation({
    mutationFn: () =>
      api.orders.create({
        productId: product!.id,
        priceId: price!.id,
        templateId: template!.id,
        name: serverName.trim(),
      }),
    onSuccess: (res) => {
      if (res?.checkoutUrl) {
        // TODO(impl): hand off to Stripe-hosted checkout.
        window.location.href = res.checkoutUrl;
        return;
      }
      toast.success("Order placed! Your server is being provisioned.");
      router.push("/servers");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to place order"),
  });

  const sortedPrices = useMemo(
    () =>
      product
        ? [...product.prices].sort(
            (a, b) =>
              intervalOrder.indexOf(a.interval) -
              intervalOrder.indexOf(b.interval),
          )
        : [],
    [product],
  );

  const monthlyAnchor = useMemo(
    () => product?.prices.find((p) => p.interval === "MONTHLY") ?? null,
    [product],
  );

  const canNext =
    (step === 1 && !!product) ||
    (step === 2 && !!template) ||
    (step === 3 && !!price && serverName.trim().length > 0);

  function selectProduct(p: Product) {
    setProduct(p);
    // Reset downstream selections when the plan changes.
    setTemplate(null);
    setPrice(null);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Order a game server"
        description="Pick a plan, choose your game, and you're live in minutes."
      />

      <Stepper step={step} />

      {step === 1 && (
        <PlanStep
          products={products.data}
          isLoading={products.isLoading}
          selected={product}
          onSelect={selectProduct}
        />
      )}

      {step === 2 && product && (
        <GameStep
          product={product}
          selected={template}
          onSelect={setTemplate}
        />
      )}

      {step === 3 && product && (
        <IntervalStep
          prices={sortedPrices}
          monthlyAnchor={monthlyAnchor}
          selected={price}
          onSelect={setPrice}
          serverName={serverName}
          onServerName={setServerName}
        />
      )}

      {step === 4 && product && template && price && (
        <ReviewStep
          product={product}
          template={template}
          price={price}
          serverName={serverName}
        />
      )}

      {/* Footer nav */}
      <div className="flex items-center justify-between border-t pt-6">
        <Button
          variant="ghost"
          disabled={step === 1}
          onClick={() => setStep((s) => Math.max(1, s - 1))}
        >
          <ArrowLeft className="size-4" /> Back
        </Button>

        {step < 4 ? (
          <Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
            Continue <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button
            loading={createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            <ShoppingCart className="size-4" /> Complete order
          </Button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Stepper                                                                      */
/* -------------------------------------------------------------------------- */

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2 overflow-x-auto">
      {STEPS.map((s, i) => {
        const isDone = step > s.id;
        const isCurrent = step === s.id;
        return (
          <li key={s.id} className="flex flex-1 items-center gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                  isCurrent && "border-primary bg-primary text-primary-foreground",
                  isDone && "border-primary bg-primary/15 text-primary",
                  !isCurrent && !isDone && "border-border text-muted-foreground",
                )}
              >
                {isDone ? <Check className="size-4" /> : s.id}
              </span>
              <span
                className={cn(
                  "hidden truncate text-sm font-medium sm:inline",
                  isCurrent ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span
                className={cn(
                  "h-px flex-1",
                  step > s.id ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 1 — Choose a plan                                                       */
/* -------------------------------------------------------------------------- */

function PlanStep({
  products,
  isLoading,
  selected,
  onSelect,
}: {
  products?: Product[];
  isLoading: boolean;
  selected: Product | null;
  onSelect: (p: Product) => void;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-56" />
        ))}
      </div>
    );
  }

  if (!products?.length) {
    return (
      <EmptyState
        icon={ServerIcon}
        title="No plans available"
        description="There are no game server plans on sale right now. Please check back soon."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((p) => {
        const low = lowestPrice(p.prices);
        const isSelected = selected?.id === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p)}
            className={cn(
              "relative flex flex-col rounded-xl border p-5 text-left transition-all",
              isSelected
                ? "border-primary ring-2 ring-primary/30"
                : "hover:border-primary/40 hover:bg-accent/40",
            )}
          >
            {isSelected && (
              <CheckCircle2 className="absolute right-4 top-4 size-5 text-primary" />
            )}
            <p className="font-semibold">{p.name}</p>
            {p.description && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {p.description}
              </p>
            )}

            <div className="mt-4 space-y-1.5 text-sm text-muted-foreground">
              {p.cpuCores != null && (
                <Spec icon={Cpu} label={`${p.cpuCores} vCPU`} />
              )}
              {p.memoryMb != null && (
                <Spec icon={MemoryStick} label={`${formatMb(p.memoryMb)} RAM`} />
              )}
              {p.diskMb != null && (
                <Spec icon={HardDrive} label={`${formatMb(p.diskMb)} disk`} />
              )}
            </div>

            <div className="mt-4 border-t pt-3">
              {low ? (
                <p className="text-sm">
                  <span className="text-lg font-semibold">
                    {formatMoney(low.amountMinor, low.currency)}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    / {intervalLabel[low.interval].toLowerCase()}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Contact us</p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Spec({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <p className="flex items-center gap-2">
      <Icon className="size-4" /> {label}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 2 — Pick your game                                                      */
/* -------------------------------------------------------------------------- */

function GameStep({
  product,
  selected,
  onSelect,
}: {
  product: Product;
  selected: GameTemplate | null;
  onSelect: (t: GameTemplate) => void;
}) {
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const categories = useQuery({
    queryKey: ["catalog", "categories"],
    queryFn: () => api.catalog.categories(),
  });
  const templates = useQuery({
    queryKey: ["catalog", "templates"],
    queryFn: () => api.catalog.templates(),
  });

  const allowed = product.allowedTemplateIds;

  const filtered = useMemo(() => {
    let list = templates.data ?? [];
    if (allowed.length) list = list.filter((t) => allowed.includes(t.id));
    if (categoryId) list = list.filter((t) => t.categoryId === categoryId);
    return list;
  }, [templates.data, allowed, categoryId]);

  // Only show category chips that actually have selectable templates.
  const visibleCategories = useMemo(() => {
    const base = templates.data ?? [];
    const pool = allowed.length
      ? base.filter((t) => allowed.includes(t.id))
      : base;
    const ids = new Set(pool.map((t) => t.categoryId));
    return (categories.data ?? []).filter((c) => ids.has(c.id));
  }, [categories.data, templates.data, allowed]);

  if (templates.isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {visibleCategories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Chip active={categoryId === null} onClick={() => setCategoryId(null)}>
            All games
          </Chip>
          {visibleCategories.map((c) => (
            <Chip
              key={c.id}
              active={categoryId === c.id}
              onClick={() => setCategoryId(c.id)}
            >
              {c.name}
            </Chip>
          ))}
        </div>
      )}

      {filtered.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const isSelected = selected?.id === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t)}
                className={cn(
                  "relative rounded-xl border p-5 text-left transition-all",
                  isSelected
                    ? "border-primary ring-2 ring-primary/30"
                    : "hover:border-primary/40 hover:bg-accent/40",
                )}
              >
                {isSelected && (
                  <CheckCircle2 className="absolute right-4 top-4 size-5 text-primary" />
                )}
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Gamepad2 className="size-5" />
                </div>
                <div className="mt-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{t.name}</p>
                    {t.category && (
                      <Badge variant="muted">{t.category.name}</Badge>
                    )}
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {t.description ?? `${t.category?.name ?? "Game"} server template`}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Gamepad2}
          title="No games available"
          description="This plan doesn't have any compatible games yet. Try a different plan."
        />
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors",
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 3 — Billing interval                                                    */
/* -------------------------------------------------------------------------- */

function IntervalStep({
  prices,
  monthlyAnchor,
  selected,
  onSelect,
  serverName,
  onServerName,
}: {
  prices: Price[];
  monthlyAnchor: Price | null;
  selected: Price | null;
  onSelect: (p: Price) => void;
  serverName: string;
  onServerName: (v: string) => void;
}) {
  if (!prices.length) {
    return (
      <EmptyState
        icon={ServerIcon}
        title="No pricing available"
        description="This plan has no billing options configured. Please pick another plan."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {prices.map((p) => {
          const isSelected = selected?.id === p.id;
          const perMonth = p.amountMinor / intervalMonths[p.interval];
          // Savings versus paying monthly for the same span.
          let savingsPct = 0;
          if (monthlyAnchor && p.interval !== "MONTHLY") {
            const monthlyEquivalent = monthlyAnchor.amountMinor;
            if (monthlyEquivalent > 0) {
              savingsPct = Math.round(
                (1 - perMonth / monthlyEquivalent) * 100,
              );
            }
          }
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p)}
              className={cn(
                "relative flex items-center justify-between rounded-xl border p-5 text-left transition-all",
                isSelected
                  ? "border-primary ring-2 ring-primary/30"
                  : "hover:border-primary/40 hover:bg-accent/40",
              )}
            >
              <div className="space-y-1">
                <p className="font-semibold">{intervalLabel[p.interval]}</p>
                <p className="text-sm text-muted-foreground">
                  {formatMoney(perMonth, p.currency)} / month
                </p>
                {savingsPct > 0 && (
                  <Badge variant="success">Save {savingsPct}%</Badge>
                )}
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold">
                  {formatMoney(p.amountMinor, p.currency)}
                </p>
                <p className="text-xs text-muted-foreground">
                  billed {intervalLabel[p.interval].toLowerCase()}
                </p>
              </div>
              {isSelected && (
                <CheckCircle2 className="absolute right-4 top-4 size-5 text-primary" />
              )}
            </button>
          );
        })}
      </div>

      <div className="max-w-md space-y-1.5">
        <Label htmlFor="server-name">Server name</Label>
        <Input
          id="server-name"
          placeholder="My awesome server"
          value={serverName}
          onChange={(e) => onServerName(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          You can rename your server at any time.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 4 — Review & checkout                                                   */
/* -------------------------------------------------------------------------- */

function ReviewStep({
  product,
  template,
  price,
  serverName,
}: {
  product: Product;
  template: GameTemplate;
  price: Price;
  serverName: string;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="divide-y p-0">
          <SummaryRow label="Plan" value={product.name} />
          <SummaryRow label="Game" value={template.name} />
          <SummaryRow label="Server name" value={serverName} />
          <SummaryRow label="Billing" value={intervalLabel[price.interval]} />
          <div className="flex items-center justify-between p-5">
            <span className="font-medium">Total due today</span>
            <span className="text-xl font-semibold">
              {formatMoney(price.amountMinor, price.currency)}
            </span>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {/* TODO(impl): a Stripe checkout session is created on submit; you'll be
            redirected to complete payment securely. */}
        On checkout you&apos;ll be redirected to our secure payment provider to
        complete your purchase. Your server is provisioned automatically once
        payment succeeds.
      </p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between p-5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
