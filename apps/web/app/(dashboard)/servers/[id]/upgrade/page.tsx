"use client";

import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, MemoryStick, HardDrive, ArrowRight, Loader2, TrendingUp, TrendingDown } from "lucide-react";
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

const CPU = { min: 0.5, max: 8, step: 0.5 };
const MEM = { min: 1024, max: 32768, step: 1024 };
const DISK = { min: 5120, max: 204800, step: 5120 };

function intervalLabel(interval: string) {
  const map: Record<string, string> = {
    MONTHLY: "/mo",
    QUARTERLY: "/quarter",
    SEMIANNUAL: "/6 mo",
    ANNUAL: "/yr",
  };
  return map[interval] ?? `/${interval.toLowerCase()}`;
}

function ResourceRow({
  icon: Icon,
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="size-4 text-muted-foreground" />
          {label}
        </div>
        <span className="font-mono text-sm tabular-nums">{display}</span>
      </div>
      <Slider value={value} min={min} max={max} step={step} onChange={onChange} />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label === "CPU cores" ? `${min}` : formatMb(min)}</span>
        <span>{label === "CPU cores" ? `${max}` : formatMb(max)}</span>
      </div>
    </div>
  );
}

export default function UpgradePage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: server, isLoading } = useQuery({
    queryKey: ["server", id],
    queryFn: () => api.servers.get(id),
  });

  const [cpuCores, setCpuCores] = useState<number>(CPU.min);
  const [memoryMb, setMemoryMb] = useState<number>(MEM.min);
  const [diskMb, setDiskMb] = useState<number>(DISK.min);
  const [initialized, setInitialized] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Seed sliders from current server values once loaded.
  useEffect(() => {
    if (server && !initialized) {
      setCpuCores(server.cpuCores);
      setMemoryMb(server.memoryMb);
      setDiskMb(server.diskMb);
      setInitialized(true);
    }
  }, [server, initialized]);

  // Debounce slider changes before requesting a preview.
  const [debounced, setDebounced] = useState({ cpuCores, memoryMb, diskMb });
  useEffect(() => {
    const t = setTimeout(() => setDebounced({ cpuCores, memoryMb, diskMb }), 500);
    return () => clearTimeout(t);
  }, [cpuCores, memoryMb, diskMb]);

  const unchanged =
    !!server &&
    cpuCores === server.cpuCores &&
    memoryMb === server.memoryMb &&
    diskMb === server.diskMb;

  const { data: preview, isFetching: previewLoading } = useQuery({
    queryKey: ["upgrade-preview", id, debounced.cpuCores, debounced.memoryMb, debounced.diskMb],
    queryFn: () => api.servers.upgradePreview(id, debounced),
    enabled: initialized,
  });

  const upgradeMutation = useMutation({
    mutationFn: () => api.servers.upgrade(id, { cpuCores, memoryMb, diskMb }),
    onSuccess: () => {
      toast.success("Resources updated");
      queryClient.invalidateQueries({ queryKey: ["server", id] });
      setConfirmOpen(false);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to apply changes"),
  });

  const delta = preview?.deltaMinor ?? 0;
  const isDowngrade = delta < 0;
  const deltaDisplay = useMemo(() => {
    if (!preview) return null;
    const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
    return `${sign}${formatMoney(Math.abs(delta), preview.currency)}`;
  }, [preview, delta]);

  if (isLoading || !server) {
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upgrade resources"
        description="Scale your plan up or down. Changes are billed on your next cycle."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        {/* Sliders */}
        <Card>
          <CardHeader>
            <CardTitle>Resources</CardTitle>
            <CardDescription>Drag to adjust your allocation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <ResourceRow
              icon={Cpu}
              label="CPU cores"
              value={cpuCores}
              min={CPU.min}
              max={CPU.max}
              step={CPU.step}
              display={`${cpuCores} vCPU`}
              onChange={setCpuCores}
            />
            <ResourceRow
              icon={MemoryStick}
              label="Memory"
              value={memoryMb}
              min={MEM.min}
              max={MEM.max}
              step={MEM.step}
              display={formatMb(memoryMb)}
              onChange={setMemoryMb}
            />
            <ResourceRow
              icon={HardDrive}
              label="Disk"
              value={diskMb}
              min={DISK.min}
              max={DISK.max}
              step={DISK.step}
              display={formatMb(diskMb)}
              onChange={setDiskMb}
            />
          </CardContent>
        </Card>

        {/* Price preview */}
        <Card className="lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle>Price preview</CardTitle>
            <CardDescription>Estimated recurring cost for the new plan.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border bg-muted/30 p-4">
              {previewLoading || !preview ? (
                <div className="flex h-16 items-center justify-center text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">New recurring price</p>
                  <p className="text-2xl font-semibold tracking-tight">
                    {formatMoney(preview.amountMinor, preview.currency)}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      {intervalLabel(preview.interval)}
                    </span>
                  </p>
                  {delta !== 0 && deltaDisplay && (
                    <p
                      className={cn(
                        "inline-flex items-center gap-1 text-sm font-medium",
                        isDowngrade ? "text-success" : "text-primary",
                      )}
                    >
                      {isDowngrade ? (
                        <TrendingDown className="size-4" />
                      ) : (
                        <TrendingUp className="size-4" />
                      )}
                      {deltaDisplay} {isDowngrade ? "saved" : "more"}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Current vs new comparison */}
            <div className="space-y-2 text-sm">
              <ComparisonRow
                label="CPU"
                from={`${server.cpuCores} vCPU`}
                to={`${cpuCores} vCPU`}
                changed={cpuCores !== server.cpuCores}
              />
              <ComparisonRow
                label="Memory"
                from={formatMb(server.memoryMb)}
                to={formatMb(memoryMb)}
                changed={memoryMb !== server.memoryMb}
              />
              <ComparisonRow
                label="Disk"
                from={formatMb(server.diskMb)}
                to={formatMb(diskMb)}
                changed={diskMb !== server.diskMb}
              />
            </div>

            <Button
              className="w-full"
              disabled={unchanged || previewLoading}
              onClick={() => setConfirmOpen(true)}
            >
              Apply changes
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm resource change</DialogTitle>
            <DialogDescription>
              Review your new allocation before applying.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-sm">
            <ComparisonRow
              label="CPU"
              from={`${server.cpuCores} vCPU`}
              to={`${cpuCores} vCPU`}
              changed={cpuCores !== server.cpuCores}
            />
            <ComparisonRow
              label="Memory"
              from={formatMb(server.memoryMb)}
              to={formatMb(memoryMb)}
              changed={memoryMb !== server.memoryMb}
            />
            <ComparisonRow
              label="Disk"
              from={formatMb(server.diskMb)}
              to={formatMb(diskMb)}
              changed={diskMb !== server.diskMb}
            />
          </div>

          {preview && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">New recurring price</span>
                <span className="font-medium">
                  {formatMoney(preview.amountMinor, preview.currency)}
                  {intervalLabel(preview.interval)}
                </span>
              </div>
              {delta !== 0 && deltaDisplay && (
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {isDowngrade ? "Reduction" : "Increase"}
                  </span>
                  <span className={cn("font-medium", isDowngrade ? "text-success" : "text-primary")}>
                    {deltaDisplay}
                  </span>
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Prorated difference applies on your next billing cycle.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={upgradeMutation.isPending}
              onClick={() => upgradeMutation.mutate()}
            >
              Apply changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
