"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Boxes,
  Plus,
  Activity,
  Copy,
  Check,
  TriangleAlert,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge, NodeStateBadge } from "@/components/ui/badge";
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
import { formatMb, formatDateTime } from "@/lib/utils";
import type { Node, NodeOs } from "@/lib/types";

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
          await navigator.clipboard.writeText(value);
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
};

export default function AdminNodesPage() {
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [bootstrapToken, setBootstrapToken] = useState<string | null>(null);
  const [detailNode, setDetailNode] = useState<Node | null>(null);

  const { data: nodes, isLoading } = useQuery({
    queryKey: ["admin", "nodes"],
    queryFn: () => api.admin.nodes(),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "nodes"] });

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
      }),
    onSuccess: (node) => {
      toast.success("Node created");
      invalidate();
      setCreateOpen(false);
      setForm(emptyForm);
      setBootstrapToken(node.bootstrapToken);
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nodes"
        description="Manage daemon nodes, capacity and maintenance windows."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Add node
          </Button>
        }
      />

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : nodes?.length ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>FQDN</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>OS</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Servers</TableHead>
                  <TableHead>Maintenance</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {nodes.map((node) => (
                  <TableRow key={node.id}>
                    <TableCell className="font-medium">{node.name}</TableCell>
                    <TableCell className="font-mono text-xs">{node.fqdn}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {node.region?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{node.os}</Badge>
                    </TableCell>
                    <TableCell>
                      <NodeStateBadge state={node.state} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {node.cpuCores} vCPU · {formatMb(node.memoryMb)} ·{" "}
                      {formatMb(node.diskMb)}
                    </TableCell>
                    <TableCell className="tabular-nums">{node.servers ?? 0}</TableCell>
                    <TableCell>
                      <Switch
                        checked={node.maintenance}
                        disabled={maintenanceMutation.isPending}
                        onCheckedChange={(v) =>
                          maintenanceMutation.mutate({ id: node.id, maintenance: v })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDetailNode(node)}
                      >
                        <Activity className="size-4" />
                      </Button>
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
              Register a new daemon node. A one-time bootstrap token will be issued
              after creation.
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
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="node-fqdn">FQDN</Label>
                <Input
                  id="node-fqdn"
                  placeholder="node-eu-01.example.com"
                  value={form.fqdn}
                  onChange={(e) => setForm((f) => ({ ...f, fqdn: e.target.value }))}
                  className="font-mono"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="node-region">Region ID</Label>
                <Input
                  id="node-region"
                  placeholder="reg_..."
                  value={form.regionId}
                  onChange={(e) => setForm((f) => ({ ...f, regionId: e.target.value }))}
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Operating system</Label>
                <Select
                  value={form.os}
                  onValueChange={(v) => setForm((f) => ({ ...f, os: v as NodeOs }))}
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
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={createMutation.isPending}
              disabled={!form.name.trim() || !form.fqdn.trim() || !form.regionId.trim()}
              onClick={() => createMutation.mutate()}
            >
              Create node
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bootstrap token dialog (shown once) */}
      <Dialog open={!!bootstrapToken} onOpenChange={(o) => !o && setBootstrapToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bootstrap token</DialogTitle>
            <DialogDescription>
              Run the daemon installer with this token to enroll the node.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              Copy this token now — it is shown only once and cannot be retrieved
              again.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-md border bg-muted/50 px-3 py-2 font-mono text-sm">
              {bootstrapToken}
            </code>
            {bootstrapToken && <CopyButton value={bootstrapToken} />}
          </div>

          <DialogFooter>
            <Button onClick={() => setBootstrapToken(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Node detail / heartbeats dialog */}
      <Dialog open={!!detailNode} onOpenChange={(o) => !o && setDetailNode(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detailNode?.name}</DialogTitle>
            <DialogDescription>
              CPU utilisation over the last hour.
            </DialogDescription>
          </DialogHeader>
          {detailNode && <NodeHeartbeatChart nodeId={detailNode.id} />}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDetailNode(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NodeHeartbeatChart({ nodeId }: { nodeId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "node-heartbeats", nodeId],
    queryFn: () => api.admin.nodeHeartbeats(nodeId),
  });

  if (isLoading) return <Skeleton className="h-56 w-full" />;
  if (!data?.length)
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No heartbeats reported yet.
      </p>
    );

  const points = data.map((h) => ({
    t: formatDateTime(h.recordedAt),
    cpu: Math.round(h.cpuPct),
  }));

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="node-cpu" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="t" hide />
          <YAxis
            domain={[0, 100]}
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
            formatter={(v: number) => [`${v}%`, "CPU"]}
          />
          <Area
            type="monotone"
            dataKey="cpu"
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            fill="url(#node-cpu)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
