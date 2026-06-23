"use client";

import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, MemoryStick, HardDrive, ArrowRight, TrendingUp, TrendingDown, Users, Check } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { cn, formatMb, formatMoney } from "@/lib/utils";

function intervalLabel(interval: string) {
  const map: Record<string, string> = {
    WEEKLY: "/wk",
    BIWEEKLY: "/2 wk",
    MONTHLY: "/mo",
    QUARTERLY: "/quarter",
    SEMIANNUAL: "/6 mo",
    ANNUAL: "/yr",
  };
  return map[interval] ?? `/${interval.toLowerCase()}`;
}

type UpgradeOptions = Awaited<ReturnType<typeof api.servers.upgradeOptions>>;
type UpgradeTier = UpgradeOptions["tiers"][number];
type PlanChangeResult = Awaited<ReturnType<typeof api.servers.upgrade>>;

/**
 * Route the outcome of a plan change. An UPGRADE is `invoiced` — the server
 * stays on its current plan until the customer pays the new invoice, so we send
 * them to Billing. A cheaper plan is `scheduled` for the next renewal; a no-cost
 * change `applied` immediately.
 */
function handlePlanChange(
  res: PlanChangeResult,
  router: ReturnType<typeof useRouter>,
) {
  if (res.status === "invoiced") {
    toast.success(
      "Upgrade invoice created — pay it to apply your new plan. Your server stays on its current plan until payment clears.",
    );
    router.push("/billing");
    return;
  }
  if (res.status === "scheduled") {
    toast.success("Downgrade scheduled — it takes effect at your next renewal.");
    return;
  }
  toast.success("Plan updated — changes applied now.");
}

export default function UpgradePage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: opts, isLoading } = useQuery({
    queryKey: ["upgrade-options", id],
    queryFn: () => api.servers.upgradeOptions(id),
  });

  const [slots, setSlots] = useState(1);
  const [initialized, setInitialized] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (opts && !initialized) {
      setSlots(opts.slots);
      setInitialized(true);
    }
  }, [opts, initialized]);

  // Per-slot pricing is deterministic, so the preview computes instantly
  // client-side (no round-trip): resources and cost both scale with slots.
  const derived = useMemo(() => {
    if (!opts) return null;
    return {
      cpuCores: Number((opts.cpuPerSlot * slots).toFixed(2)),
      memoryMb: opts.memoryMbPerSlot * slots,
      diskMb: opts.diskMbPerSlot * slots,
      amountMinor: opts.perSlotAmountMinor * slots,
    };
  }, [opts, slots]);

  const upgradeMutation = useMutation({
    mutationFn: () => api.servers.upgrade(id, { slots }),
    onSuccess: (res) => {
      handlePlanChange(res, router);
      queryClient.invalidateQueries({ queryKey: ["server", id] });
      queryClient.invalidateQueries({ queryKey: ["upgrade-options", id] });
      setConfirmOpen(false);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to apply changes"),
  });

  if (isLoading || !opts || !derived) {
    return (
      <div className="space-y-6">
        <PageHeader title="Upgrade resources" />
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  // Tiered game products upgrade by hardware tier (Low/Mid/High), not slots.
  if (opts.tiers && opts.tiers.length > 0) {
    return <TierUpgrade id={id} opts={opts} />;
  }

  if (!opts.perSlot) {
    return (
      <div className="space-y-6">
        <PageHeader title="Upgrade resources" />
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            This plan isn&apos;t slot-based and can&apos;t be resized here. Contact
            support to change its resources.
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentAmount = opts.perSlotAmountMinor * opts.slots;
  const delta = derived.amountMinor - currentAmount;
  const isDowngrade = delta < 0;
  const unchanged = slots === opts.slots;
  const deltaDisplay = `${delta > 0 ? "+" : delta < 0 ? "-" : ""}${formatMoney(Math.abs(delta), opts.currency)}`;
  const ramGb = (derived.memoryMb / 1024).toFixed(derived.memoryMb % 1024 === 0 ? 0 : 1);
  const diskGb = (derived.diskMb / 1024).toFixed(derived.diskMb % 1024 === 0 ? 0 : 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upgrade resources"
        description="Scale your plan up or down. Upgrades are billed now (prorated) and apply once paid; downgrades take effect at your next renewal."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>Plan size</CardTitle>
            <CardDescription>
              Drag to set your slot count — CPU, memory and disk scale together.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Slots</span>
                <span className="font-mono text-sm tabular-nums">{slots}</span>
              </div>
              <Slider
                value={slots}
                min={opts.minSlots}
                max={opts.maxSlots}
                step={opts.slotStep || 1}
                onChange={setSlots}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{opts.minSlots}</span>
                <span>{opts.maxSlots}</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <DerivedStat icon={Cpu} label="CPU" value={`${derived.cpuCores} vCPU`} />
              <DerivedStat icon={MemoryStick} label="Memory" value={`${ramGb} GB`} />
              <DerivedStat icon={HardDrive} label="Disk" value={`${diskGb} GB`} />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle>Price preview</CardTitle>
            <CardDescription>Recurring cost for the new plan size.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground">New recurring price</p>
              <p className="text-2xl font-semibold tracking-tight">
                {formatMoney(derived.amountMinor, opts.currency)}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  {intervalLabel(opts.interval)}
                </span>
              </p>
              {delta !== 0 && (
                <p
                  className={cn(
                    "inline-flex items-center gap-1 text-sm font-medium",
                    isDowngrade ? "text-success" : "text-primary",
                  )}
                >
                  {isDowngrade ? <TrendingDown className="size-4" /> : <TrendingUp className="size-4" />}
                  {deltaDisplay} {isDowngrade ? "saved" : "more"}
                </p>
              )}
            </div>

            <div className="space-y-2 text-sm">
              <ComparisonRow label="Slots" from={`${opts.slots}`} to={`${slots}`} changed={slots !== opts.slots} />
              <ComparisonRow label="CPU" from={`${opts.cpuCores} vCPU`} to={`${derived.cpuCores} vCPU`} changed={derived.cpuCores !== opts.cpuCores} />
              <ComparisonRow label="Memory" from={formatMb(opts.memoryMb)} to={formatMb(derived.memoryMb)} changed={derived.memoryMb !== opts.memoryMb} />
              <ComparisonRow label="Disk" from={formatMb(opts.diskMb)} to={formatMb(derived.diskMb)} changed={derived.diskMb !== opts.diskMb} />
            </div>

            <Button className="w-full" disabled={unchanged} onClick={() => setConfirmOpen(true)}>
              Apply changes
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm plan change</DialogTitle>
            <DialogDescription>Review your new plan size before applying.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <ComparisonRow label="Slots" from={`${opts.slots}`} to={`${slots}`} changed={slots !== opts.slots} />
            <ComparisonRow label="CPU" from={`${opts.cpuCores} vCPU`} to={`${derived.cpuCores} vCPU`} changed={derived.cpuCores !== opts.cpuCores} />
            <ComparisonRow label="Memory" from={formatMb(opts.memoryMb)} to={formatMb(derived.memoryMb)} changed={derived.memoryMb !== opts.memoryMb} />
            <ComparisonRow label="Disk" from={formatMb(opts.diskMb)} to={formatMb(derived.diskMb)} changed={derived.diskMb !== opts.diskMb} />
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">New recurring price</span>
              <span className="font-medium">
                {formatMoney(derived.amountMinor, opts.currency)}
                {intervalLabel(opts.interval)}
              </span>
            </div>
            {delta !== 0 && (
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">{isDowngrade ? "Reduction" : "Increase"}</span>
                <span className={cn("font-medium", isDowngrade ? "text-success" : "text-primary")}>
                  {deltaDisplay}
                </span>
              </div>
            )}
            {delta > 0 && (
              <div className="mt-2 flex items-center justify-between border-t border-border/50 pt-2">
                <span className="text-muted-foreground">Due today (prorated)</span>
                <span className="font-semibold">
                  {formatMoney(Math.round(delta * opts.prorationFactor), opts.currency)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">+ tax</span>
                </span>
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {isDowngrade
                ? "This is a downgrade: it takes effect at your next renewal, so you keep your current resources until then. No charge now."
                : delta > 0
                  ? "This is an upgrade: we'll invoice the prorated amount above now. Your server stays on its current size until that invoice is paid — then the new size applies automatically."
                  : "No price change; the new size applies immediately."}
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button loading={upgradeMutation.isPending} onClick={() => upgradeMutation.mutate()}>
              Apply changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Hardware-tier upgrade: pick a higher (or lower) tier card. */
function TierUpgrade({ id, opts }: { id: string; opts: UpgradeOptions }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const tiers = opts.tiers;
  const current = tiers.find((t) => t.id === opts.currentTierId) ?? null;
  const [tierId, setTierId] = useState<string | null>(
    opts.currentTierId ?? current?.id ?? tiers[0]?.id ?? null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const selected = tiers.find((t) => t.id === tierId) ?? null;

  const upgradeMutation = useMutation({
    mutationFn: () => api.servers.upgrade(id, { hardwareTierId: tierId! }),
    onSuccess: (res) => {
      handlePlanChange(res, router);
      queryClient.invalidateQueries({ queryKey: ["server", id] });
      queryClient.invalidateQueries({ queryKey: ["upgrade-options", id] });
      setConfirmOpen(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to apply changes"),
  });

  const currentAmount = current?.amountMinor ?? 0;
  const newAmount = selected?.amountMinor ?? 0;
  const delta = newAmount - currentAmount;
  const isDowngrade = delta < 0;
  const unchanged = !selected || selected.id === opts.currentTierId;
  const deltaDisplay = `${delta > 0 ? "+" : delta < 0 ? "-" : ""}${formatMoney(Math.abs(delta), opts.currency)}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upgrade resources"
        description="Move to a higher tier for more power, or a lower one to save. Upgrades are billed now (prorated) and apply once paid; downgrades take effect at your next renewal."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tiers.map((t) => (
            <TierUpgradeCard
              key={t.id}
              tier={t}
              active={t.id === tierId}
              isCurrent={t.id === opts.currentTierId}
              currency={opts.currency}
              interval={opts.interval}
              onSelect={() => setTierId(t.id)}
            />
          ))}
        </div>

        <Card className="lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle>Price preview</CardTitle>
            <CardDescription>Recurring cost for the selected tier.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground">New recurring price</p>
              <p className="text-2xl font-semibold tracking-tight">
                {selected?.amountMinor != null ? formatMoney(selected.amountMinor, opts.currency) : "—"}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  {intervalLabel(opts.interval)}
                </span>
              </p>
              {delta !== 0 && selected?.amountMinor != null && (
                <p
                  className={cn(
                    "inline-flex items-center gap-1 text-sm font-medium",
                    isDowngrade ? "text-success" : "text-primary",
                  )}
                >
                  {isDowngrade ? <TrendingDown className="size-4" /> : <TrendingUp className="size-4" />}
                  {deltaDisplay} {isDowngrade ? "saved" : "more"}
                </p>
              )}
            </div>

            <div className="space-y-2 text-sm">
              <ComparisonRow label="Tier" from={current?.name ?? "—"} to={selected?.name ?? "—"} changed={!unchanged} />
              <ComparisonRow label="CPU" from={`${opts.cpuCores} vCPU`} to={`${selected?.cpuCores ?? opts.cpuCores} vCPU`} changed={(selected?.cpuCores ?? opts.cpuCores) !== opts.cpuCores} />
              <ComparisonRow label="Memory" from={formatMb(opts.memoryMb)} to={formatMb(selected?.memoryMb ?? opts.memoryMb)} changed={(selected?.memoryMb ?? opts.memoryMb) !== opts.memoryMb} />
              <ComparisonRow label="Disk" from={formatMb(opts.diskMb)} to={formatMb(selected?.diskMb ?? opts.diskMb)} changed={(selected?.diskMb ?? opts.diskMb) !== opts.diskMb} />
            </div>

            <Button
              className="w-full"
              disabled={unchanged || selected?.amountMinor == null}
              onClick={() => setConfirmOpen(true)}
            >
              Apply changes
            </Button>
            {selected?.amountMinor == null && !unchanged && (
              <p className="text-xs text-warning">
                This tier has no price for your billing cycle yet — contact support.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm tier change</DialogTitle>
            <DialogDescription>Review your new tier before applying.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <ComparisonRow label="Tier" from={current?.name ?? "—"} to={selected?.name ?? "—"} changed={!unchanged} />
            <ComparisonRow label="CPU" from={`${opts.cpuCores} vCPU`} to={`${selected?.cpuCores ?? opts.cpuCores} vCPU`} changed={(selected?.cpuCores ?? opts.cpuCores) !== opts.cpuCores} />
            <ComparisonRow label="Memory" from={formatMb(opts.memoryMb)} to={formatMb(selected?.memoryMb ?? opts.memoryMb)} changed={(selected?.memoryMb ?? opts.memoryMb) !== opts.memoryMb} />
            <ComparisonRow label="Disk" from={formatMb(opts.diskMb)} to={formatMb(selected?.diskMb ?? opts.diskMb)} changed={(selected?.diskMb ?? opts.diskMb) !== opts.diskMb} />
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">New recurring price</span>
              <span className="font-medium">
                {selected?.amountMinor != null ? formatMoney(selected.amountMinor, opts.currency) : "—"}
                {intervalLabel(opts.interval)}
              </span>
            </div>
            {delta !== 0 && (
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">{isDowngrade ? "Reduction" : "Increase"}</span>
                <span className={cn("font-medium", isDowngrade ? "text-success" : "text-primary")}>
                  {deltaDisplay}
                </span>
              </div>
            )}
            {delta > 0 && (
              <div className="mt-2 flex items-center justify-between border-t border-border/50 pt-2">
                <span className="text-muted-foreground">Due today (prorated)</span>
                <span className="font-semibold">
                  {formatMoney(Math.round(delta * opts.prorationFactor), opts.currency)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">+ tax</span>
                </span>
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {isDowngrade
                ? "This is a downgrade: it takes effect at your next renewal, so you keep your current tier until then. No charge now."
                : delta > 0
                  ? "This is an upgrade: we'll invoice the prorated amount above now. Your server stays on its current tier until that invoice is paid — then the new tier applies automatically."
                  : "No price change; the new tier applies immediately."}
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button loading={upgradeMutation.isPending} onClick={() => upgradeMutation.mutate()}>
              Apply changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TierUpgradeCard({
  tier,
  active,
  isCurrent,
  currency,
  interval,
  onSelect,
}: {
  tier: UpgradeTier;
  active: boolean;
  isCurrent: boolean;
  currency: string;
  interval: string;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "relative flex flex-col gap-3 rounded-xl border p-4 text-left transition-colors",
        active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent/40",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{tier.name}</p>
        <div className="flex items-center gap-1">
          {isCurrent && <Badge variant="secondary" className="text-[10px]">Current</Badge>}
          {tier.isRecommended && !isCurrent && (
            <Badge variant="secondary" className="text-[10px]">Recommended</Badge>
          )}
        </div>
      </div>
      {tier.description && <p className="text-xs text-muted-foreground">{tier.description}</p>}
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
          {tier.amountMinor != null ? formatMoney(tier.amountMinor, currency) : "—"}
          {tier.amountMinor != null && (
            <span className="text-xs font-normal text-muted-foreground">{intervalLabel(interval)}</span>
          )}
        </span>
        {active && <Check className="size-4 text-primary" />}
      </div>
    </button>
  );
}

function DerivedStat({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <Icon className="size-4 text-muted-foreground" />
      <div>
        <p className="refx-eyebrow">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

function ComparisonRow({
  label,
  from,
  to,
  changed,
}: {
  label: string;
  from: string;
  to: string;
  changed: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 font-mono text-xs">
        <span className={cn(changed && "text-muted-foreground line-through")}>{from}</span>
        {changed && (
          <>
            <ArrowRight className="size-3 text-muted-foreground" />
            <span className="font-medium text-foreground">{to}</span>
          </>
        )}
      </span>
    </div>
  );
}
