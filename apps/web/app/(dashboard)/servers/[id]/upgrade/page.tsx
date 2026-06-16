"use client";

import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, MemoryStick, HardDrive, ArrowRight, TrendingUp, TrendingDown } from "lucide-react";
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

export default function UpgradePage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

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
    onSuccess: () => {
      toast.success("Plan updated — new size applies now; billing adjusts next cycle.");
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
        description="Scale your plan up or down. The new size applies now; billing adjusts on your next cycle."
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
            <p className="mt-2 text-xs text-muted-foreground">
              The new size applies immediately; the price difference is reflected on your next invoice.
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
