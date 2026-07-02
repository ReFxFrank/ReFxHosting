"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Boxes,
  KeyRound,
  Plus,
  Activity,
  Copy,
  Check,
  TriangleAlert,
  Trash2,
  Cpu,
  MemoryStick,
  HardDrive,
  MapPin,
  Wifi,
  WifiOff,
  AlertTriangle,
  Play,
  RotateCw,
  Square,
  Download,
  Server as ServerIcon,
  DollarSign,
} from "lucide-react";
import { api, ApiError, API_URL } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge, NodeStateBadge, ServerStateBadge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  cn,
  formatMb,
  formatDateTime,
  pct,
  copyToClipboard,
} from "@/lib/utils";
import type { Node, NodeOs, NodeEconomics } from "@/lib/types";

/** GitHub repo the node-agent installer scripts live in (matches install-node.sh). */
const REPO_SLUG = "refxfrank/refxhosting";

/**
 * Build the copy-paste agent install command for a node's OS, with the panel
 * API URL and bootstrap token pre-filled. The installer strips a trailing
 * /api or /api/v1, but API_URL is already the bare origin, so pass it as-is.
 */
function installCommand(os: NodeOs, token: string): string {
  const raw = `https://raw.githubusercontent.com/${REPO_SLUG}/main/infra/scripts`;
  if (os === "WINDOWS") {
    return [
      "cd $env:TEMP",
      "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12",
      `Invoke-WebRequest -Uri "${raw}/install-node.ps1" -OutFile install-node.ps1 -UseBasicParsing`,
      `powershell -ExecutionPolicy Bypass -File .\\install-node.ps1 -PanelUrl ${API_URL} -Token ${token} -Version latest`,
    ].join("\n");
  }
  return [
    `curl -fsSL ${raw}/install-node.sh -o install-node.sh`,
    `sudo bash install-node.sh --panel-url ${API_URL} --token ${token}`,
  ].join("\n");
}

/** Format integer minor units (cents) as a currency string. */
function fmtMoney(minor: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}

/** Bar tint by utilisation: green < 70 < amber < 90 < red. */
function usageIndicator(value: number) {
  if (value > 90)
    return "bg-destructive shadow-[0_0_12px_-2px_rgba(255,80,80,0.7)]";
  if (value > 70)
    return "bg-warning shadow-[0_0_12px_-2px_rgba(245,170,40,0.7)]";
  return "bg-success shadow-[0_0_12px_-2px_rgba(40,200,120,0.6)]";
}

/** Compact labelled usage bar (used in the list + detail dialog). */
function UsageBar({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[0.6875rem] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Icon className="size-3" /> {label}
        </span>
        <span className="tabular-nums">{detail}</span>
      </div>
      <Progress value={value} indicatorClassName={usageIndicator(value)} />
    </div>
  );
}

/** Edit a node's schedulable capacity (what the placement engine reserves against). */
function EditCapacityDialog({
  node,
  onClose,
}: {
  node: Node | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: (v: Parameters<typeof api.admin.updateNode>[1]) =>
      api.admin.updateNode(node!.id, v),
    onSuccess: () => {
      toast.success("Node updated");
      queryClient.invalidateQueries({ queryKey: ["admin", "nodes"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "node-economics"] });
      onClose();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to update node"),
  });

  const pin = useMutation({
    mutationFn: () => api.admin.pinNodeCert(node!.id),
    onSuccess: (r) => {
      toast.success(`Certificate pinned (${r.sha256.slice(0, 16)}…)`);
      queryClient.invalidateQueries({ queryKey: ["admin", "nodes"] });
      onClose();
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Couldn't pin certificate",
      ),
  });
  const unpin = useMutation({
    mutationFn: () => api.admin.unpinNodeCert(node!.id),
    onSuccess: () => {
      toast.success("Certificate unpinned");
      queryClient.invalidateQueries({ queryKey: ["admin", "nodes"] });
      onClose();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Couldn't unpin"),
  });

  return (
    <Dialog
      open={!!node}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit node — {node?.name}</DialogTitle>
          <DialogDescription>
            The connection address the panel uses to reach this node&apos;s
            agent (FQDN/port), and the schedulable capacity the placement engine
            reserves.
          </DialogDescription>
        </DialogHeader>
        {node && (
          <CapacityForm
            key={node.id}
            node={node}
            onSubmit={(v) => save.mutate(v)}
            saving={save.isPending}
          />
        )}

        {node && (
          <div className="space-y-2 border-t pt-4">
            <p className="refx-eyebrow">Agent TLS certificate</p>
            {node.agentCertSha256 ? (
              <div className="flex items-center justify-between gap-3">
                <p
                  className="min-w-0 truncate font-mono text-xs text-muted-foreground"
                  title={node.agentCertSha256}
                >
                  Pinned · {node.agentCertSha256.slice(0, 24)}…
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={unpin.isPending}
                  onClick={() => unpin.mutate()}
                >
                  Unpin
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Not pinned — the panel accepts any cert. Pin to verify the
                  agent (requires AGENT_TLS_PINNING).
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  loading={pin.isPending}
                  onClick={() => pin.mutate()}
                >
                  Pin certificate
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Controlled connection + capacity inputs, initialised from the node. */
function CapacityForm({
  node,
  onSubmit,
  saving,
}: {
  node: Node;
  onSubmit: (v: Parameters<typeof api.admin.updateNode>[1]) => void;
  saving: boolean;
}) {
  const [fqdn, setFqdn] = useState(node.fqdn ?? "");
  const [scheme, setScheme] = useState<"http" | "https">(
    (node.scheme as "http" | "https") ?? "https",
  );
  const [daemonPort, setDaemonPort] = useState(node.daemonPort ?? 8443);
  const [cpuCores, setCpuCores] = useState(node.cpuCores ?? 1);
  const [memoryMb, setMemoryMb] = useState(node.memoryMb ?? 1024);
  const [diskMb, setDiskMb] = useState(node.diskMb ?? 10240);
  const [gameDomain, setGameDomain] = useState(node.gameDomain ?? "");
  const [supportsWeb, setSupportsWeb] = useState(!!node.supportsWeb);
  const [monthlyCost, setMonthlyCost] = useState(
    node.monthlyCostMinor != null ? String(node.monthlyCostMinor / 100) : "",
  );
  const [costCurrency, setCostCurrency] = useState(node.costCurrency ?? "USD");
  const [provider, setProvider] = useState(node.provider ?? "");

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="refx-eyebrow">Connection</p>
        <div className="grid gap-4 sm:grid-cols-[1fr_110px_120px]">
          <div className="space-y-1.5">
            <Label htmlFor="node-fqdn">FQDN / IP</Label>
            <Input
              id="node-fqdn"
              value={fqdn}
              placeholder="node1.example.com or 1.2.3.4"
              onChange={(e) => setFqdn(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="node-scheme">Scheme</Label>
            <Select
              value={scheme}
              onValueChange={(v) => setScheme(v as "http" | "https")}
            >
              <SelectTrigger id="node-scheme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="https">https</SelectItem>
                <SelectItem value="http">http</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="node-port">Agent port</Label>
            <Input
              id="node-port"
              type="number"
              min={1}
              value={daemonPort}
              onChange={(e) => setDaemonPort(Number(e.target.value))}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          The panel reaches the agent at{" "}
          <span className="font-mono">
            {scheme}://{fqdn || "…"}:{daemonPort}
          </span>
          .
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="node-game-domain-edit">Game domain (optional)</Label>
          <Input
            id="node-game-domain-edit"
            placeholder="e.g. fra.refx.gg"
            value={gameDomain}
            onChange={(e) => setGameDomain(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Branded per-server addresses via a wildcard{" "}
            <span className="font-mono">
              *.{gameDomain.trim() || "fra.refx.gg"}
            </span>{" "}
            DNS record → this node&apos;s IP. Applies to newly-provisioned
            servers. Blank = use the FQDN.
          </p>
        </div>
        <div className="flex items-start justify-between gap-3 rounded-lg border border-white/[0.08] p-3">
          <div>
            <Label htmlFor="node-supports-web-edit">Web hosting enabled</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              This node runs Caddy on :80/:443 and can host web servers. The
              scheduler only places web hosting on web-enabled nodes.
            </p>
          </div>
          <Switch
            id="node-supports-web-edit"
            checked={supportsWeb}
            onCheckedChange={setSupportsWeb}
          />
        </div>
      </div>

      <div className="space-y-3">
        <p className="refx-eyebrow">Schedulable capacity</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="cap-cpu">vCPU cores</Label>
            <Input
              id="cap-cpu"
              type="number"
              min={1}
              value={cpuCores}
              onChange={(e) => setCpuCores(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cap-mem">Memory (MB)</Label>
            <Input
              id="cap-mem"
              type="number"
              min={256}
              value={memoryMb}
              onChange={(e) => setMemoryMb(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cap-disk">Disk (MB)</Label>
            <Input
              id="cap-disk"
              type="number"
              min={1024}
              value={diskMb}
              onChange={(e) => setDiskMb(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <p className="refx-eyebrow">Cost &amp; economics</p>
        <div className="grid gap-4 sm:grid-cols-[1fr_110px]">
          <div className="space-y-1.5">
            <Label htmlFor="node-cost">Your monthly cost</Label>
            <Input
              id="node-cost"
              type="number"
              min={0}
              step="0.01"
              placeholder="e.g. 174.00"
              value={monthlyCost}
              onChange={(e) => setMonthlyCost(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="node-currency">Currency</Label>
            <Input
              id="node-currency"
              value={costCurrency}
              onChange={(e) => setCostCurrency(e.target.value.toUpperCase())}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="node-provider">Provider / box label (optional)</Label>
          <Input
            id="node-provider"
            placeholder="e.g. OVH Rise-3 · Hillsboro"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          What this node costs you (the hardware/hosting bill). Drives the
          margin view — leave the cost blank if you don&apos;t want to track it.
        </p>
      </div>

      <DialogFooter>
        <Button
          loading={saving}
          disabled={!fqdn.trim()}
          onClick={() =>
            onSubmit({
              fqdn: fqdn.trim(),
              scheme,
              daemonPort,
              cpuCores,
              memoryMb,
              diskMb,
              gameDomain: gameDomain.trim(),
              supportsWeb,
              monthlyCostMinor: monthlyCost.trim()
                ? Math.round(Number(monthlyCost) * 100)
                : 0,
              costCurrency: costCurrency.trim() || "USD",
              provider: provider.trim(),
            })
          }
        >
          Save node
        </Button>
      </DialogFooter>
    </div>
  );
}

/** Live panel->agent latency probe, polled while visible. */
function NodePing({ nodeId, poll }: { nodeId: string; poll?: boolean }) {
  // Poll everywhere so a transient blip (e.g. an agent restart) self-corrects
  // without a manual reload. The detail drawer refreshes a little faster.
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "node-ping", nodeId],
    queryFn: () => api.admin.nodePing(nodeId),
    refetchInterval: poll ? 10_000 : 30_000,
    retry: false,
  });

  if (isLoading) return <Skeleton className="h-4 w-12" />;

  if (!data?.reachable || data.ms == null) {
    // Distinguish "agent is alive (a recent heartbeat arrived) but the panel
    // can't reach its API port" — a firewall/binding issue, not a dead agent —
    // from a genuinely offline node.
    const recentHeartbeat =
      data?.heartbeatAgeMs != null && data.heartbeatAgeMs < 120_000;
    if (recentHeartbeat) {
      return (
        <span
          className="flex items-center gap-1 text-xs font-medium text-warning"
          title="The agent is alive (heartbeat received in the last 2 min) but the panel can't reach its API port. Check the node's firewall on the daemon port (default 8443) and that the agent binds to a public interface."
        >
          <AlertTriangle className="size-3" /> unreachable
        </span>
      );
    }
    return (
      <span
        className="flex items-center gap-1 text-xs font-medium text-destructive"
        title="No response from the agent and no recent heartbeat — the agent is likely down or the node is unreachable."
      >
        <WifiOff className="size-3" /> offline
      </span>
    );
  }

  const tint =
    data.ms > 150
      ? "text-destructive"
      : data.ms > 60
        ? "text-warning"
        : "text-success";
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-xs font-medium tabular-nums",
        tint,
      )}
    >
      <Wifi className="size-3" /> {data.ms} ms
    </span>
  );
}

/** Agent version + "update available" indicator vs the latest published release. */
function AgentVersionBadge({
  current,
  latest,
}: {
  current: string | null;
  latest: string | null;
}) {
  if (!current) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  // Compare loosely (ignore a leading "v"): node reports the build's tag.
  const norm = (v: string) => v.replace(/^v/, "");
  const behind = latest != null && norm(current) !== norm(latest);
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-xs">{current}</span>
      {behind ? (
        <Badge variant="warning" className="w-fit text-[10px]">
          Update available
        </Badge>
      ) : latest != null ? (
        <Badge variant="success" className="w-fit text-[10px]">
          Up to date
        </Badge>
      ) : null}
    </div>
  );
}

/** Three stacked gauges driven by a node's latest heartbeat vs capacity. */
function NodeUsage({ node, compact }: { node: Node; compact?: boolean }) {
  const hb = node.latestHeartbeat;
  if (!hb) {
    return <span className="text-xs text-muted-foreground">No heartbeat</span>;
  }
  // hb.cpuPct is whole-machine utilisation [0,100] (aggregate /proc/stat), NOT
  // per-core — so show it against the node's core count like MEM/DISK show used
  // vs capacity, e.g. "0.8 / 16 cores · 5%".
  const cpu = Math.round(hb.cpuPct);
  const coresUsed = (hb.cpuPct / 100) * (node.cpuCores || 0);
  const memPct = pct(hb.memUsedMb, node.memoryMb);
  const diskPct = pct(hb.diskUsedMb, node.diskMb);
  return (
    <div className={cn("space-y-2", compact ? "w-44" : "w-full")}>
      <UsageBar
        icon={Cpu}
        label="CPU"
        value={cpu}
        detail={
          node.cpuCores
            ? `${coresUsed.toFixed(1)} / ${node.cpuCores} cores · ${cpu}%`
            : `${cpu}%`
        }
      />
      <UsageBar
        icon={MemoryStick}
        label="MEM"
        value={memPct}
        detail={`${formatMb(hb.memUsedMb)} / ${formatMb(node.memoryMb)}`}
      />
      <UsageBar
        icon={HardDrive}
        label="DISK"
        value={diskPct}
        detail={`${formatMb(hb.diskUsedMb)} / ${formatMb(node.diskMb)}`}
      />
    </div>
  );
}

const OS_OPTIONS: { value: NodeOs; label: string }[] = [
  { value: "LINUX", label: "Linux" },
  { value: "WINDOWS", label: "Windows" },
];

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      onClick={async () => {
        try {
          if (!(await copyToClipboard(value))) throw new Error("copy failed");
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Failed to copy to clipboard");
        }
      }}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
    </Button>
  );
}

const emptyForm = {
  name: "",
  fqdn: "",
  regionId: "",
  os: "LINUX" as NodeOs,
  cpuCores: 8,
  memoryMb: 16384,
  diskMb: 512000,
  allocationPortStart: 25565,
  allocationPortEnd: 25999,
  gameDomain: "",
  supportsWeb: false,
  monthlyCost: "",
  costCurrency: "USD",
  provider: "",
};

/** A single portfolio stat tile. */
function EconTile({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "good" && "text-emerald-400",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </p>
      {sub ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
      ) : null}
    </div>
  );
}

/**
 * Portfolio economics: total cost vs. estimated revenue + a per-node margin
 * table. Revenue is derived from the active subscriptions of servers on each
 * node, so it's an estimate (comps/free servers carry no subscription).
 */
function NodeEconomicsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "node-economics"],
    queryFn: () => api.admin.nodeEconomics(),
  });

  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (!data || data.nodes.length === 0) return null;

  const t = data.totals;
  const cur = data.currency;
  const marginPct =
    t.monthlyRevenueMinorEstimated > 0
      ? Math.round((t.marginMinor / t.monthlyRevenueMinorEstimated) * 100)
      : null;
  const profitable = t.marginMinor >= 0;

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <DollarSign className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Economics</h2>
          <span className="text-xs text-muted-foreground">
            estimated monthly · {t.nodesWithCost}/{t.nodeCount} nodes have a
            cost set
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <EconTile
            label="Monthly cost"
            value={fmtMoney(t.monthlyCostMinor, cur)}
            sub="Your hardware / hosting bill"
          />
          <EconTile
            label="Est. monthly revenue"
            value={fmtMoney(t.monthlyRevenueMinorEstimated, cur)}
            sub="Active subscriptions on these nodes"
          />
          <EconTile
            label="Margin"
            value={`${fmtMoney(t.marginMinor, cur)}${
              marginPct != null ? ` · ${marginPct}%` : ""
            }`}
            tone={profitable ? "good" : "bad"}
            sub={profitable ? "In profit" : "Underwater"}
          />
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Node</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Est. revenue</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">RAM sold</TableHead>
                <TableHead className="text-right">$/GB</TableHead>
                <TableHead className="text-right">Break-even</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.nodes.map((n) => {
                const ramSoldGb = n.allocated.memoryMb / 1024;
                const capGb = n.capacity.memoryMb / 1024;
                const hasCost = n.monthlyCostMinor != null;
                const profit = n.marginMinor != null && n.marginMinor >= 0;
                return (
                  <TableRow key={n.id}>
                    <TableCell>
                      <div className="font-medium">{n.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {n.provider || n.region?.name || "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {hasCost ? (
                        fmtMoney(n.monthlyCostMinor!, n.costCurrency)
                      ) : (
                        <span className="text-muted-foreground">not set</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtMoney(n.monthlyRevenueMinorEstimated, cur)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums font-medium",
                        n.marginMinor != null &&
                          (profit ? "text-emerald-400" : "text-destructive"),
                      )}
                    >
                      {n.marginMinor != null ? (
                        fmtMoney(n.marginMinor, cur)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {ramSoldGb.toFixed(ramSoldGb % 1 === 0 ? 0 : 1)} /{" "}
                      {capGb.toFixed(0)} GB
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {n.effectivePerGbMinor != null
                        ? fmtMoney(n.effectivePerGbMinor, cur)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {n.breakEvenMemGb != null
                        ? `${n.breakEvenMemGb} GB`
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          Revenue is estimated from active subscriptions on each node — staff
          comps and free servers aren&apos;t counted. &ldquo;Break-even&rdquo;
          is the RAM you&apos;d need sold at the current $/GB to cover that
          node&apos;s cost.
        </p>
      </CardContent>
    </Card>
  );
}

export default function AdminNodesPage() {
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [bootstrap, setBootstrap] = useState<{
    token: string;
    os: NodeOs;
  } | null>(null);
  const [detailNode, setDetailNode] = useState<Node | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Node | null>(null);
  const [editNode, setEditNode] = useState<Node | null>(null);
  const [restartTarget, setRestartTarget] = useState<Node | null>(null);
  const [steamClearTarget, setSteamClearTarget] = useState<Node | null>(null);
  const [updateTarget, setUpdateTarget] = useState<Node | null>(null);

  const { data: nodes, isLoading } = useQuery({
    queryKey: ["admin", "nodes"],
    queryFn: () => api.admin.nodes(),
  });

  // Regions for the create form's picker (avoids hand-typing a UUID).
  const { data: regions } = useQuery({
    queryKey: ["admin", "regions"],
    queryFn: () => api.admin.regions(),
    enabled: createOpen,
  });

  // Latest published agent release → "update available" badges.
  const { data: agentLatest } = useQuery({
    queryKey: ["admin", "agent-latest"],
    queryFn: () => api.admin.agentLatestVersion(),
    staleTime: 10 * 60 * 1000,
  });
  const latestVersion = agentLatest?.latest ?? null;
  const [updateAllOpen, setUpdateAllOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const updateAllMutation = useMutation({
    mutationFn: (ids?: string[]) => api.admin.updateAllNodeAgents(ids),
    onSuccess: (res) => {
      setUpdateAllOpen(false);
      setSelected(new Set());
      if (res.updated.length)
        toast.success(
          `Updating ${res.updated.length} node${res.updated.length === 1 ? "" : "s"}…`,
        );
      if (res.failed.length)
        toast.error(
          `${res.failed.length} unreachable — ${res.failed[0].name}: ${res.failed[0].reason}`,
        );
      if (!res.updated.length && !res.failed.length)
        toast.info("No nodes to update");
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Failed to update agents",
      ),
  });

  const nodeList = nodes ?? [];
  const allSelected = nodeList.length > 0 && selected.size === nodeList.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(nodeList.map((n) => n.id)));
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "nodes"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "node-economics"] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.admin.createNode({
        name: form.name,
        fqdn: form.fqdn,
        regionId: form.regionId,
        os: form.os,
        cpuCores: form.cpuCores,
        memoryMb: form.memoryMb,
        diskMb: form.diskMb,
        allocationPortStart: form.allocationPortStart,
        allocationPortEnd: form.allocationPortEnd,
        gameDomain: form.gameDomain.trim() || undefined,
        supportsWeb: form.supportsWeb,
        monthlyCostMinor: form.monthlyCost.trim()
          ? Math.round(Number(form.monthlyCost) * 100)
          : undefined,
        costCurrency: form.costCurrency.trim() || "USD",
        provider: form.provider.trim() || undefined,
      }),
    onSuccess: (node) => {
      toast.success("Node created");
      invalidate();
      setCreateOpen(false);
      setBootstrap({ token: node.bootstrapToken, os: form.os });
      setForm(emptyForm);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to create node"),
  });

  const maintenanceMutation = useMutation({
    mutationFn: ({ id, maintenance }: { id: string; maintenance: boolean }) =>
      api.admin.setNodeMaintenance(id, maintenance),
    onSuccess: () => {
      toast.success("Node updated");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to update node"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.admin.deleteNode(id),
    onSuccess: () => {
      toast.success("Node deleted");
      invalidate();
      setDeleteTarget(null);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to delete node"),
  });

  const regenerateBootstrapMutation = useMutation({
    mutationFn: (id: string) => api.admin.regenerateNodeBootstrap(id),
    onSuccess: (res) => {
      // The old token is now dead; surface the fresh one in the same dialog the
      // create flow uses.
      setBootstrap({
        token: res.bootstrapToken,
        os: detailNode?.os ?? "LINUX",
      });
      setDetailNode(null);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Failed to regenerate token",
      ),
  });

  const restartAgentMutation = useMutation({
    mutationFn: (id: string) => api.admin.restartNodeAgent(id),
    onSuccess: () => {
      toast.success(
        "Agent restart requested — the node reconnects in a few seconds",
      );
      setRestartTarget(null);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Failed to restart agent",
      ),
  });

  const clearSteamCacheMutation = useMutation({
    mutationFn: (id: string) => api.admin.clearNodeSteamCache(id),
    onSuccess: () => {
      toast.success(
        "Steam cache cleared — the next install re-authenticates the account",
      );
      setSteamClearTarget(null);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Failed to clear Steam cache",
      ),
  });

  const updateAgentMutation = useMutation({
    mutationFn: (id: string) => api.admin.updateNodeAgent(id),
    onSuccess: () => {
      toast.success(
        "Updating — the agent downloads the latest release and reconnects shortly",
      );
      setUpdateTarget(null);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to update agent"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nodes"
        description="Manage daemon nodes, capacity and maintenance windows."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setUpdateAllOpen(true)}>
              <Download className="size-4" />{" "}
              {selected.size
                ? `Update selected (${selected.size})`
                : "Update all agents"}
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Add node
            </Button>
          </div>
        }
      />

      <NodeEconomicsPanel />

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : nodes?.length ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all nodes"
                      className="size-4 accent-[hsl(var(--primary))]"
                      checked={allSelected}
                      onChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>OS</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Ping</TableHead>
                  <TableHead className="w-48">Live usage</TableHead>
                  <TableHead>Servers</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Maintenance</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {nodes.map((node) => (
                  <TableRow
                    key={node.id}
                    data-state={selected.has(node.id) ? "selected" : undefined}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Select ${node.name}`}
                        className="size-4 accent-[hsl(var(--primary))]"
                        checked={selected.has(node.id)}
                        onChange={() => toggleOne(node.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{node.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {node.fqdn}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 text-sm">
                        <MapPin className="size-3.5 text-muted-foreground" />
                        <span>
                          {node.region?.name ?? "—"}
                          {node.region?.country && (
                            <span className="text-xs text-muted-foreground">
                              {" · "}
                              {node.region.country}
                            </span>
                          )}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{node.os}</Badge>
                    </TableCell>
                    <TableCell>
                      <NodeStateBadge state={node.state} />
                    </TableCell>
                    <TableCell>
                      <NodePing nodeId={node.id} />
                    </TableCell>
                    <TableCell>
                      <NodeUsage node={node} compact />
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {node.servers ?? 0}
                    </TableCell>
                    <TableCell>
                      <AgentVersionBadge
                        current={node.agentVersion}
                        latest={latestVersion}
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={node.maintenance}
                        disabled={maintenanceMutation.isPending}
                        onCheckedChange={(v: boolean) =>
                          maintenanceMutation.mutate({
                            id: node.id,
                            maintenance: v,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Live activity"
                          onClick={() => setDetailNode(node)}
                        >
                          <Activity className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Update agent"
                          onClick={() => setUpdateTarget(node)}
                        >
                          <Download className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Edit capacity"
                          onClick={() => setEditNode(node)}
                        >
                          <Cpu className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(node)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={Boxes}
          title="No nodes yet"
          description="Add your first node to start provisioning servers."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Add node
            </Button>
          }
        />
      )}

      {/* Create node dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add node</DialogTitle>
            <DialogDescription>
              Register a new daemon node. A one-time bootstrap token will be
              issued after creation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="node-name">Name</Label>
                <Input
                  id="node-name"
                  placeholder="node-eu-01"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="node-fqdn">FQDN</Label>
                <Input
                  id="node-fqdn"
                  placeholder="node-eu-01.example.com"
                  value={form.fqdn}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fqdn: e.target.value }))
                  }
                  className="font-mono"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Region</Label>
                <Select
                  value={form.regionId}
                  onValueChange={(v) => setForm((f) => ({ ...f, regionId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a region" />
                  </SelectTrigger>
                  <SelectContent>
                    {regions?.length ? (
                      regions.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name} · {r.country}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="__none" disabled>
                        No regions configured
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Operating system</Label>
                <Select
                  value={form.os}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, os: v as NodeOs }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="node-cpu">CPU cores</Label>
                <Input
                  id="node-cpu"
                  type="number"
                  min={1}
                  value={form.cpuCores}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cpuCores: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="node-mem">Memory (MB)</Label>
                <Input
                  id="node-mem"
                  type="number"
                  min={512}
                  value={form.memoryMb}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, memoryMb: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="node-disk">Disk (MB)</Label>
                <Input
                  id="node-disk"
                  type="number"
                  min={1024}
                  value={form.diskMb}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, diskMb: Number(e.target.value) }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="node-port-start">
                  Allocation port range — start
                </Label>
                <Input
                  id="node-port-start"
                  type="number"
                  min={1}
                  max={65535}
                  value={form.allocationPortStart}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      allocationPortStart: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="node-port-end">
                  Allocation port range — end
                </Label>
                <Input
                  id="node-port-end"
                  type="number"
                  min={1}
                  max={65535}
                  value={form.allocationPortEnd}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      allocationPortEnd: Number(e.target.value),
                    }))
                  }
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Servers on this node get their game + query/RCON ports from this
              range. Open it on the node&apos;s firewall / security group.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="node-game-domain">Game domain (optional)</Label>
              <Input
                id="node-game-domain"
                placeholder="e.g. fra.refx.gg"
                value={form.gameDomain}
                onChange={(e) =>
                  setForm((f) => ({ ...f, gameDomain: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Branded per-server addresses. Add a wildcard DNS record
                <span className="font-mono">
                  {" "}
                  *.{form.gameDomain.trim() || "fra.refx.gg"}{" "}
                </span>
                → this node&apos;s public IP; each server then shows
                <span className="font-mono">
                  {" "}
                  &lt;id&gt;.{form.gameDomain.trim() || "fra.refx.gg"}:port{" "}
                </span>
                instead of the raw IP. Leave blank to use the node FQDN.
              </p>
            </div>

            <div className="flex items-start justify-between gap-3 rounded-lg border border-white/[0.08] p-3">
              <div>
                <Label htmlFor="node-supports-web">Web hosting enabled</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Turn on if this node runs Caddy on :80/:443 for web servers.
                  The scheduler only places web hosting on web-enabled nodes.
                </p>
              </div>
              <Switch
                id="node-supports-web"
                checked={form.supportsWeb}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, supportsWeb: v }))
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_100px]">
              <div className="space-y-1.5">
                <Label htmlFor="create-node-cost">
                  Your monthly cost (optional)
                </Label>
                <Input
                  id="create-node-cost"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="e.g. 174.00"
                  value={form.monthlyCost}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, monthlyCost: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-node-currency">Currency</Label>
                <Input
                  id="create-node-currency"
                  value={form.costCurrency}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      costCurrency: e.target.value.toUpperCase(),
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-node-provider">
                Provider / box label (optional)
              </Label>
              <Input
                id="create-node-provider"
                placeholder="e.g. OVH Rise-3 · Hillsboro"
                value={form.provider}
                onChange={(e) =>
                  setForm((f) => ({ ...f, provider: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                What this node costs you — powers the margin view. Editable
                later.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={createMutation.isPending}
              disabled={
                !form.name.trim() || !form.fqdn.trim() || !form.regionId.trim()
              }
              onClick={() => createMutation.mutate()}
            >
              Create node
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Install command / bootstrap token dialog (shown once) */}
      <Dialog open={!!bootstrap} onOpenChange={(o) => !o && setBootstrap(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install the node agent</DialogTitle>
            <DialogDescription>
              {bootstrap?.os === "WINDOWS"
                ? "Run this in an elevated PowerShell on the Windows node."
                : "Run this as root on the Linux node."}{" "}
              It installs the agent and enrolls it with this panel.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              This is shown only once — the token can&apos;t be retrieved again
              (regenerate a new one from the node&apos;s menu if you lose it).
            </span>
          </div>

          {bootstrap && (
            <>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="refx-eyebrow">
                    Install command
                    {bootstrap.os === "WINDOWS" ? " (PowerShell)" : " (root)"}
                  </p>
                  <CopyButton
                    value={installCommand(bootstrap.os, bootstrap.token)}
                  />
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border bg-muted/50 px-3 py-2 font-mono text-xs leading-relaxed">
                  {installCommand(bootstrap.os, bootstrap.token)}
                </pre>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Panel URL <span className="font-mono">{API_URL}</span> is
                  pre-filled. The node flips to{" "}
                  <span className="font-medium">online</span> here within a few
                  seconds of the agent starting.
                </p>
              </div>

              <div>
                <p className="refx-eyebrow mb-1.5">Bootstrap token only</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 overflow-x-auto rounded-md border bg-muted/50 px-3 py-2 font-mono text-sm">
                    {bootstrap.token}
                  </code>
                  <CopyButton value={bootstrap.token} />
                </div>
              </div>
            </>
          )}

          <DialogFooter>
            <Button onClick={() => setBootstrap(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Node detail / heartbeats dialog */}
      <Dialog
        open={!!detailNode}
        onOpenChange={(o) => !o && setDetailNode(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {detailNode?.name}
              {detailNode && <NodeStateBadge state={detailNode.state} />}
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" />
                {detailNode?.region?.name ?? "—"}
                {detailNode?.region?.country
                  ? ` · ${detailNode.region.country}`
                  : ""}
              </span>
              {detailNode && <NodePing nodeId={detailNode.id} poll />}
            </DialogDescription>
          </DialogHeader>
          {detailNode && (
            <NodeDetailLive nodeId={detailNode.id} fallback={detailNode} />
          )}
          {detailNode && <NodeServersPower nodeId={detailNode.id} />}
          {detailNode && <NodeHeartbeatChart nodeId={detailNode.id} />}
          <DialogFooter className="sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => detailNode && setUpdateTarget(detailNode)}
              >
                <Download className="size-4" /> Update agent
              </Button>
              <Button
                variant="outline"
                onClick={() => detailNode && setRestartTarget(detailNode)}
              >
                <RotateCw className="size-4" /> Restart agent
              </Button>
              <Button
                variant="outline"
                onClick={() => detailNode && setSteamClearTarget(detailNode)}
              >
                <Boxes className="size-4" /> Clear Steam cache
              </Button>
              <Button
                variant="outline"
                loading={regenerateBootstrapMutation.isPending}
                onClick={() =>
                  detailNode &&
                  regenerateBootstrapMutation.mutate(detailNode.id)
                }
              >
                <KeyRound className="size-4" /> Regenerate token
              </Button>
            </div>
            <Button variant="ghost" onClick={() => setDetailNode(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit capacity */}
      <EditCapacityDialog node={editNode} onClose={() => setEditNode(null)} />

      {/* Delete node confirmation */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete node</DialogTitle>
            <DialogDescription>
              Delete node {deleteTarget?.name}? This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={deleteMutation.isPending}
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.id)
              }
            >
              Delete node
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restart agent confirmation */}
      <Dialog
        open={!!restartTarget}
        onOpenChange={(o) => !o && setRestartTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restart agent on {restartTarget?.name}?</DialogTitle>
            <DialogDescription>
              The node daemon restarts and reconnects within a few seconds.
              Running game servers are <b>not</b> stopped — they keep running
              and re-attach automatically. This does not reboot the VPS itself.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRestartTarget(null)}>
              Cancel
            </Button>
            <Button
              loading={restartAgentMutation.isPending}
              onClick={() =>
                restartTarget && restartAgentMutation.mutate(restartTarget.id)
              }
            >
              <RotateCw className="size-4" /> Restart agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update ALL agents confirmation */}
      <Dialog open={updateAllOpen} onOpenChange={setUpdateAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selected.size
                ? `Update ${selected.size} selected node${selected.size === 1 ? "" : "s"}?`
                : "Update every node's agent?"}
            </DialogTitle>
            <DialogDescription>
              Each node downloads the latest released agent, verifies it, swaps
              it in and restarts — no SSH. Running game servers keep running and
              re-attach. Unreachable nodes are skipped and reported.
              {latestVersion && (
                <span className="mt-2 block">
                  Latest release:{" "}
                  <span className="font-mono">{latestVersion}</span>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setUpdateAllOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={updateAllMutation.isPending}
              onClick={() =>
                updateAllMutation.mutate(
                  selected.size ? Array.from(selected) : undefined,
                )
              }
            >
              <Download className="size-4" />{" "}
              {selected.size ? "Update selected" : "Update all"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update agent confirmation */}
      <Dialog
        open={!!updateTarget}
        onOpenChange={(o) => !o && setUpdateTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update agent on {updateTarget?.name}?</DialogTitle>
            <DialogDescription>
              The node downloads the latest released agent binary, verifies it,
              swaps it in and restarts — no SSH needed. Running game servers are
              <b> not</b> stopped; they keep running and re-attach in a few
              seconds. The node must be able to reach GitHub releases.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setUpdateTarget(null)}>
              Cancel
            </Button>
            <Button
              loading={updateAgentMutation.isPending}
              onClick={() =>
                updateTarget && updateAgentMutation.mutate(updateTarget.id)
              }
            >
              <Download className="size-4" /> Update agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Steam cache confirmation */}
      <Dialog
        open={!!steamClearTarget}
        onOpenChange={(o) => !o && setSteamClearTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Clear Steam cache on {steamClearTarget?.name}?
            </DialogTitle>
            <DialogDescription>
              Wipes every cached steamcmd session on this node — use after
              changing or deauthorising a Steam game-download account so no old
              account&apos;s session lingers. Running servers are <b>not</b>{" "}
              affected. The next install re-authenticates the current account,
              which may ask for a one-time Steam Guard code again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSteamClearTarget(null)}>
              Cancel
            </Button>
            <Button
              loading={clearSteamCacheMutation.isPending}
              onClick={() =>
                steamClearTarget &&
                clearSteamCacheMutation.mutate(steamClearTarget.id)
              }
            >
              <Boxes className="size-4" /> Clear Steam cache
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Live gauges for the detail dialog: refetches the node (latest heartbeat) on a
 * 10s interval while the dialog is open. Falls back to the row's cached node
 * until the first refetch lands.
 */
function NodeDetailLive({
  nodeId,
  fallback,
}: {
  nodeId: string;
  fallback: Node;
}) {
  const { data } = useQuery({
    queryKey: ["admin", "node", nodeId],
    queryFn: () => api.admin.node(nodeId),
    refetchInterval: 10_000,
    initialData: fallback,
  });
  return (
    <Card>
      <CardContent className="p-4">
        <NodeUsage node={data ?? fallback} />
        <p className="mt-3 text-[0.6875rem] text-muted-foreground">
          {fallback.cpuCores} vCPU · {formatMb(fallback.memoryMb)} RAM ·{" "}
          {formatMb(fallback.diskMb)} disk
          {data?.latestHeartbeat &&
            ` · updated ${formatDateTime(data.latestHeartbeat.recordedAt)}`}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Per-server power controls for every server hosted on this node. Each server is
 * powered independently (start / restart / stop) — turning one off leaves the
 * rest running. Admins pass the per-server permission guard, so this reuses the
 * standard `/servers/:id/power` endpoint.
 */
function NodeServersPower({ nodeId }: { nodeId: string }) {
  const queryClient = useQueryClient();

  const { data: servers, isLoading } = useQuery({
    queryKey: ["admin", "node-servers", nodeId],
    // The admin server list isn't node-scoped server-side; filter client-side.
    queryFn: async () => {
      const all = await api.admin.servers();
      return all.filter((s) => s.nodeId === nodeId);
    },
    refetchInterval: 10_000,
  });

  const [pending, setPending] = useState<string | null>(null);

  const powerMutation = useMutation({
    mutationFn: ({
      id,
      signal,
    }: {
      id: string;
      signal: "start" | "stop" | "restart";
    }) => api.servers.power(id, signal),
    onMutate: ({ id, signal }) => setPending(`${id}:${signal}`),
    onSuccess: (_d, { signal }) => {
      toast.success(`${signal[0].toUpperCase()}${signal.slice(1)} signal sent`);
      // State updates arrive via the agent; nudge a refetch shortly after.
      setTimeout(
        () =>
          queryClient.invalidateQueries({
            queryKey: ["admin", "node-servers", nodeId],
          }),
        1500,
      );
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Power action failed"),
    onSettled: () => setPending(null),
  });

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <ServerIcon className="size-4 text-muted-foreground" />
          Servers on this node
          {servers && (
            <Badge variant="secondary" className="ml-1">
              {servers.length}
            </Badge>
          )}
        </div>

        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : !servers?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No servers are hosted on this node.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {servers.map((s) => {
              const busy =
                powerMutation.isPending && pending?.startsWith(`${s.id}:`);
              return (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{s.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {s.shortId}
                    </div>
                  </div>
                  <ServerStateBadge state={s.state} />
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Start"
                      title="Start"
                      disabled={
                        busy || s.state === "RUNNING" || s.state === "STARTING"
                      }
                      onClick={() =>
                        powerMutation.mutate({ id: s.id, signal: "start" })
                      }
                    >
                      <Play className="size-3.5 text-success" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Restart"
                      title="Restart"
                      disabled={busy || s.state !== "RUNNING"}
                      onClick={() =>
                        powerMutation.mutate({ id: s.id, signal: "restart" })
                      }
                    >
                      <RotateCw className="size-3.5 text-warning" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Stop"
                      title="Stop"
                      disabled={
                        busy || s.state === "OFFLINE" || s.state === "STOPPING"
                      }
                      onClick={() =>
                        powerMutation.mutate({ id: s.id, signal: "stop" })
                      }
                    >
                      <Square className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NodeHeartbeatChart({ nodeId }: { nodeId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "node-heartbeats", nodeId],
    queryFn: () => api.admin.nodeHeartbeats(nodeId),
    refetchInterval: 10_000,
  });

  const node = useQuery({
    queryKey: ["admin", "node", nodeId],
    queryFn: () => api.admin.node(nodeId),
  }).data;

  if (isLoading) return <Skeleton className="h-56 w-full" />;
  if (!data?.length)
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No heartbeats reported yet.
      </p>
    );

  const memTotal = node?.memoryMb ?? 0;
  const diskTotal = node?.diskMb ?? 0;

  // History comes back newest-first; reverse so the chart reads left -> right.
  const points = [...data].reverse().map((h) => ({
    t: formatDateTime(h.recordedAt),
    cpu: Math.round(h.cpuPct),
    mem: memTotal ? pct(h.memUsedMb, memTotal) : 0,
    disk: diskTotal ? pct(h.diskUsedMb, diskTotal) : 0,
  }));

  // Only plot disk if it carries signal (avoids a flat zero line cluttering it).
  const showDisk = points.some((p) => p.disk > 0);

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={points}
          margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
        >
          <defs>
            <linearGradient id="node-cpu" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="hsl(var(--primary))"
                stopOpacity={0.35}
              />
              <stop
                offset="100%"
                stopColor="hsl(var(--primary))"
                stopOpacity={0}
              />
            </linearGradient>
            <linearGradient id="node-mem" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="hsl(var(--success))"
                stopOpacity={0.3}
              />
              <stop
                offset="100%"
                stopColor="hsl(var(--success))"
                stopOpacity={0}
              />
            </linearGradient>
            <linearGradient id="node-disk" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="hsl(var(--warning))"
                stopOpacity={0.25}
              />
              <stop
                offset="100%"
                stopColor="hsl(var(--warning))"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            vertical={false}
          />
          <XAxis dataKey="t" hide />
          <YAxis
            domain={[0, 100]}
            unit="%"
            width={40}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
          />
          <ReTooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v, name) => [`${v}%`, String(name)] as [string, string]}
          />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
          <Area
            type="monotone"
            dataKey="cpu"
            name="CPU"
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            fill="url(#node-cpu)"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="mem"
            name="Memory"
            stroke="hsl(var(--success))"
            strokeWidth={1.5}
            fill="url(#node-mem)"
            isAnimationActive={false}
          />
          {showDisk && (
            <Area
              type="monotone"
              dataKey="disk"
              name="Disk"
              stroke="hsl(var(--warning))"
              strokeWidth={1.5}
              fill="url(#node-disk)"
              isAnimationActive={false}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
