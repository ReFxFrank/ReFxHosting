"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HardDrive,
  Plus,
  Minus,
  Trash2,
  ExternalLink,
  Power,
  Play,
  RotateCw,
  Square,
  Zap,
  ArrowLeftRight,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ServerStateBadge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import type {
  AdminServer,
  GameTemplate,
  ServerTransfer,
  TransferState,
} from "@/lib/types";

/** Non-terminal transfer states (an in-flight move). */
const ACTIVE_TRANSFER_STATES: TransferState[] = [
  "PENDING",
  "SNAPSHOTTING",
  "PROVISIONING",
  "RESTORING",
  "FINALIZING",
];

/** Human-readable step label for a transfer state. */
function transferStepLabel(state: TransferState): string {
  switch (state) {
    case "PENDING":
      return "Queued";
    case "SNAPSHOTTING":
      return "Snapshotting source";
    case "PROVISIONING":
      return "Provisioning destination";
    case "RESTORING":
      return "Restoring snapshot";
    case "FINALIZING":
      return "Finalizing";
    case "SUCCEEDED":
      return "Completed";
    case "FAILED":
      return "Failed";
  }
}

function fmtGb(mb: number): string {
  const gb = mb / 1024;
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
}

function ownerLabel(s: AdminServer): string {
  const o = s.owner;
  if (!o) return "—";
  const name = [o.firstName, o.lastName].filter(Boolean).join(" ").trim();
  return name || o.email;
}

const emptyForm = {
  name: "",
  ownerId: "",
  nodeId: "",
  templateId: "",
  cpuCores: 2,
  memoryMb: 2048,
  diskMb: 10240,
  // Slot count for voice/slot-based templates (e.g. TeamSpeak max clients).
  slots: 32,
  // Minecraft version selection (only sent for minecraft-* templates).
  minecraftVersion: "latest",
};

export default function AdminServersPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<AdminServer | null>(null);
  // The server currently open in the Transfer dialog, + the chosen destination.
  const [transferTarget, setTransferTarget] = useState<AdminServer | null>(
    null,
  );
  const [transferToNodeId, setTransferToNodeId] = useState("");
  // Staff resize (comp RAM/CPU/disk with no invoice).
  const [resizeTarget, setResizeTarget] = useState<AdminServer | null>(null);
  const [resizeForm, setResizeForm] = useState({
    cpuCores: 1,
    memoryMb: 1024,
    diskMb: 5120,
    swapMb: 0,
  });

  const { data: servers, isLoading } = useQuery({
    queryKey: ["admin", "servers"],
    queryFn: () => api.admin.servers(),
  });

  // Form option sources (loaded lazily when the dialog opens).
  const { data: users } = useQuery({
    queryKey: ["admin", "users", "all"],
    queryFn: () => api.admin.users(),
    enabled: createOpen,
  });
  const { data: nodes } = useQuery({
    queryKey: ["admin", "nodes"],
    queryFn: () => api.admin.nodes(),
    enabled: createOpen,
  });
  const { data: templates } = useQuery({
    queryKey: ["admin", "templates"],
    queryFn: () => api.admin.templates(),
    enabled: createOpen,
  });

  // Live capacity for the resize target's node, so staff see headroom before
  // bumping resources (the backend rejects a bump past the node's free pool).
  const { data: capacity } = useQuery({
    queryKey: ["admin", "node-capacity", resizeTarget?.nodeId],
    queryFn: () => api.admin.nodeCapacity(resizeTarget!.nodeId),
    enabled: !!resizeTarget,
  });

  const selectedTemplate: GameTemplate | undefined = templates?.find(
    (t) => t.id === form.templateId,
  );
  const isMinecraft = !!selectedTemplate?.slug?.startsWith("minecraft-");
  // Voice / slot-based templates (e.g. TeamSpeak) are provisioned by slot count;
  // resources auto-size from the egg's recommended specs on the server side.
  const isVoice =
    selectedTemplate?.category?.slug === "voice" ||
    !!selectedTemplate?.slug?.startsWith("teamspeak");

  // Minecraft version list (only fetched once a Minecraft egg is selected).
  const { data: mcVersions } = useQuery({
    queryKey: ["catalog", "minecraft-versions"],
    queryFn: () => api.catalog.minecraftVersions(),
    enabled: createOpen && isMinecraft,
  });

  // Selecting an egg prefills the recommended resources (overridable below).
  const selectTemplate = (id: string) => {
    const t: GameTemplate | undefined = templates?.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      templateId: id,
      cpuCores: t?.recCpuCores ?? f.cpuCores,
      memoryMb: t?.recMemoryMb ?? f.memoryMb,
      diskMb: t?.recDiskMb ?? f.diskMb,
      // Reset version to default whenever the egg changes.
      minecraftVersion: "latest",
    }));
  };

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "servers"] });

  const createMutation = useMutation({
    mutationFn: () =>
      api.admin.createServer({
        name: form.name,
        ownerId: form.ownerId,
        nodeId: form.nodeId,
        templateId: form.templateId,
        // Voice servers size from the egg's recommended specs; send only slots.
        // Game servers send explicit (prefilled-from-recommended) resources.
        ...(isVoice
          ? { slots: form.slots }
          : {
              cpuCores: form.cpuCores,
              memoryMb: form.memoryMb,
              diskMb: form.diskMb,
            }),
        // For Minecraft eggs, pin the chosen version via the install env.
        ...(isMinecraft
          ? { environment: { MINECRAFT_VERSION: form.minecraftVersion } }
          : {}),
      }),
    onSuccess: () => {
      toast.success("Server created — provisioning queued");
      invalidate();
      setCreateOpen(false);
      setForm(emptyForm);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Failed to create server",
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.admin.deleteServer(id),
    onSuccess: () => {
      toast.success("Server deleted");
      invalidate();
      setDeleteTarget(null);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Failed to delete server",
      ),
  });

  const resizeMutation = useMutation({
    mutationFn: () =>
      api.admin.resizeServer(resizeTarget!.id, {
        cpuCores: resizeForm.cpuCores,
        memoryMb: resizeForm.memoryMb,
        diskMb: resizeForm.diskMb,
        swapMb: resizeForm.swapMb,
      }),
    onSuccess: () => {
      toast.success("Resources updated — applied live");
      invalidate();
      setResizeTarget(null);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Failed to update resources",
      ),
  });
  const openResize = (s: AdminServer) => {
    setResizeForm({
      cpuCores: s.cpuCores,
      memoryMb: s.memoryMb,
      diskMb: s.diskMb,
      swapMb: s.swapMb ?? 0,
    });
    setResizeTarget(s);
  };

  const powerMutation = useMutation({
    mutationFn: (v: {
      id: string;
      signal: "start" | "stop" | "restart" | "kill";
    }) => api.servers.power(v.id, v.signal),
    onSuccess: (_d, v) => {
      toast.success(`Power: ${v.signal} sent`);
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Power action failed"),
  });

  // ---- Transfer (move a server to another node) --------------------------
  // Candidate destination nodes (loaded lazily when the dialog opens). The
  // current node is filtered out of the picker below.
  const { data: transferNodes } = useQuery({
    queryKey: ["admin", "nodes"],
    queryFn: () => api.admin.nodes(),
    enabled: !!transferTarget,
  });

  // Poll the open server's transfer history so the in-flight progress updates
  // live; stops polling once the latest transfer is terminal.
  const { data: transfers } = useQuery({
    queryKey: ["admin", "server-transfers", transferTarget?.id],
    queryFn: () => api.admin.serverTransfers(transferTarget!.id),
    enabled: !!transferTarget,
    refetchInterval: (query) => {
      const latest = query.state.data?.[0];
      return latest && ACTIVE_TRANSFER_STATES.includes(latest.state)
        ? 3_000
        : false;
    },
  });

  const latestTransfer: ServerTransfer | undefined = transfers?.[0];
  const transferInFlight =
    !!latestTransfer && ACTIVE_TRANSFER_STATES.includes(latestTransfer.state);

  const transferMutation = useMutation({
    mutationFn: (v: { id: string; toNodeId: string }) =>
      api.admin.transferServer(v.id, v.toNodeId),
    onSuccess: () => {
      toast.success("Transfer started — the server will move to the new node");
      invalidate();
      setTransferToNodeId("");
      queryClient.invalidateQueries({
        queryKey: ["admin", "server-transfers", transferTarget?.id],
      });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Failed to start transfer",
      ),
  });

  const openTransfer = (s: AdminServer) => {
    setTransferToNodeId("");
    setTransferTarget(s);
  };

  const canSubmit =
    form.name.trim() &&
    form.ownerId &&
    form.nodeId &&
    form.templateId &&
    (isVoice
      ? form.slots > 0
      : form.cpuCores > 0 && form.memoryMb >= 256 && form.diskMb >= 1024);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Servers"
        description="Provision servers directly from an egg for any owner — no subscription required."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Create server
          </Button>
        }
      />

      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : servers?.length ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Node</TableHead>
                  <TableHead>Game</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {servers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {ownerLabel(s)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.node?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.template?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <ServerStateBadge state={s.state} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Power"
                              disabled={
                                s.state === "PENDING_PAYMENT" ||
                                s.state === "INSTALLING"
                              }
                            >
                              <Power className="size-4" /> Power
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={
                                s.state === "RUNNING" || s.state === "STARTING"
                              }
                              onSelect={() =>
                                powerMutation.mutate({
                                  id: s.id,
                                  signal: "start",
                                })
                              }
                            >
                              <Play /> Start
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={s.state !== "RUNNING"}
                              onSelect={() =>
                                powerMutation.mutate({
                                  id: s.id,
                                  signal: "restart",
                                })
                              }
                            >
                              <RotateCw /> Restart
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={
                                s.state === "OFFLINE" || s.state === "CRASHED"
                              }
                              onSelect={() =>
                                powerMutation.mutate({
                                  id: s.id,
                                  signal: "stop",
                                })
                              }
                            >
                              <Square /> Stop
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              destructive
                              onSelect={() =>
                                powerMutation.mutate({
                                  id: s.id,
                                  signal: "kill",
                                })
                              }
                            >
                              <Zap /> Kill
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          title="Open server (support)"
                        >
                          <Link href={`/servers/${s.id}`}>
                            <ExternalLink className="size-4" /> Manage
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Edit resources (RAM / CPU / disk) — no invoice"
                          onClick={() => openResize(s)}
                        >
                          <HardDrive className="size-4" /> Resources
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Transfer to another node"
                          disabled={s.state === "TRANSFERRING"}
                          onClick={() => openTransfer(s)}
                        >
                          <ArrowLeftRight className="size-4" /> Transfer
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(s)}
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
          icon={HardDrive}
          title="No servers yet"
          description="Create a server from an egg to provision it on a node."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Create server
            </Button>
          }
        />
      )}

      {/* Create server dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create server</DialogTitle>
            <DialogDescription>
              Provision a server from an egg. Game servers prefill resources
              from the template&apos;s recommended values (overridable); voice
              servers are slot-based and auto-size from the recommended specs.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="srv-name">Name</Label>
              <Input
                id="srv-name"
                placeholder="My game server"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Owner</Label>
                <Select
                  value={form.ownerId}
                  onValueChange={(v) => setForm((f) => ({ ...f, ownerId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {(users?.data ?? []).map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {[u.firstName, u.lastName].filter(Boolean).join(" ") ||
                          u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Node</Label>
                <Select
                  value={form.nodeId}
                  onValueChange={(v) => setForm((f) => ({ ...f, nodeId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select node" />
                  </SelectTrigger>
                  <SelectContent>
                    {(nodes ?? []).map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Egg / template</Label>
              <Select value={form.templateId} onValueChange={selectTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Select egg" />
                </SelectTrigger>
                <SelectContent>
                  {(templates ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.category?.name
                        ? `${t.category.name} · ${t.name}`
                        : t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isMinecraft && (
              <div className="space-y-1.5">
                <Label>Minecraft version</Label>
                <Select
                  value={form.minecraftVersion}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, minecraftVersion: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select version" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="latest">Latest (recommended)</SelectItem>
                    {(mcVersions?.versions ?? []).map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isVoice ? (
              <div className="space-y-2">
                <Label htmlFor="srv-slots">
                  Slots (max simultaneous voice users)
                </Label>
                {/* Slot picker — voice servers are provisioned by slot count, not
                    RAM/CPU. Stepper + slider over 1..1024 (staff are trusted; the
                    free TS3 license caps at 32, a key lifts it). */}
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={form.slots <= 1}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        slots: Math.max(1, f.slots - 1),
                      }))
                    }
                  >
                    <Minus className="size-4" />
                  </Button>
                  <Input
                    id="srv-slots"
                    type="number"
                    min={1}
                    max={1024}
                    step={1}
                    value={form.slots}
                    className="w-24 text-center"
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        slots: Math.min(
                          1024,
                          Math.max(1, Math.floor(Number(e.target.value) || 1)),
                        ),
                      }))
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={form.slots >= 1024}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        slots: Math.min(1024, f.slots + 1),
                      }))
                    }
                  >
                    <Plus className="size-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">slots</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={1024}
                  step={1}
                  value={Math.min(1024, Math.max(1, form.slots))}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, slots: Number(e.target.value) }))
                  }
                  className="w-full accent-primary"
                  aria-label="Slots"
                />
                <p className="text-xs text-muted-foreground">
                  Voice servers are sized by slots — no RAM/CPU designation.
                  CPU, memory and disk auto-size from this template&apos;s
                  recommended specs
                  {selectedTemplate
                    ? ` (${selectedTemplate.recCpuCores} vCPU · ${selectedTemplate.recMemoryMb} MB RAM · ${selectedTemplate.recDiskMb} MB disk).`
                    : "."}
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="srv-cpu">CPU cores</Label>
                  <Input
                    id="srv-cpu"
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={form.cpuCores}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        cpuCores: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="srv-mem">Memory (MB)</Label>
                  <Input
                    id="srv-mem"
                    type="number"
                    min={256}
                    value={form.memoryMb}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        memoryMb: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="srv-disk">Disk (MB)</Label>
                  <Input
                    id="srv-disk"
                    type="number"
                    min={1024}
                    value={form.diskMb}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, diskMb: Number(e.target.value) }))
                    }
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={createMutation.isPending}
              disabled={!canSubmit}
              onClick={() => createMutation.mutate()}
            >
              Create server
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer server to another node */}
      <Dialog
        open={!!transferTarget}
        onOpenChange={(o) => {
          if (!o) {
            setTransferTarget(null);
            setTransferToNodeId("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer server</DialogTitle>
            <DialogDescription>
              Move {transferTarget?.name} to another node. The server keeps its
              identity (SFTP, backups, plan). It is stopped and snapshotted on
              the current node, re-created and restored on the destination, then
              the old copy is removed — only after the destination is verified.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Current node</Label>
              <p className="text-sm text-muted-foreground">
                {transferTarget?.node?.name ?? "—"}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Destination node</Label>
              <Select
                value={transferToNodeId}
                onValueChange={setTransferToNodeId}
                disabled={transferInFlight}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select destination node" />
                </SelectTrigger>
                <SelectContent>
                  {(transferNodes ?? [])
                    .filter((n) => n.id !== transferTarget?.nodeId)
                    .map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.name}
                        {n.maintenance ? " · maintenance" : ""}
                        {n.state !== "ONLINE"
                          ? ` · ${n.state.toLowerCase()}`
                          : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Live status of the most recent transfer for this server. */}
            {latestTransfer && (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                <div className="flex items-center gap-2">
                  {transferInFlight && (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  )}
                  <span className="font-medium">
                    {transferStepLabel(latestTransfer.state)}
                  </span>
                  <span className="text-muted-foreground">
                    {latestTransfer.state === "FAILED"
                      ? ""
                      : transferInFlight
                        ? "(in progress)"
                        : ""}
                  </span>
                </div>
                {latestTransfer.state === "FAILED" && latestTransfer.error && (
                  <p className="mt-1 text-destructive">
                    {latestTransfer.error}
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setTransferTarget(null);
                setTransferToNodeId("");
              }}
            >
              Close
            </Button>
            <Button
              loading={transferMutation.isPending}
              disabled={!transferToNodeId || transferInFlight}
              onClick={() =>
                transferTarget &&
                transferToNodeId &&
                transferMutation.mutate({
                  id: transferTarget.id,
                  toNodeId: transferToNodeId,
                })
              }
            >
              <ArrowLeftRight className="size-4" /> Start transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resize resources (staff comp — no invoice) */}
      <Dialog
        open={!!resizeTarget}
        onOpenChange={(o) => !o && setResizeTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit resources — {resizeTarget?.name}</DialogTitle>
            <DialogDescription>
              Applies live on the node (no reinstall) and does not create an
              invoice. Capacity on the server&apos;s node is checked first.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Memory (MB)</Label>
              <Input
                type="number"
                min={256}
                value={resizeForm.memoryMb}
                onChange={(e) =>
                  setResizeForm((f) => ({
                    ...f,
                    memoryMb: Number(e.target.value),
                  }))
                }
              />
              {capacity &&
                (() => {
                  const max =
                    (resizeTarget?.memoryMb ?? 0) + capacity.memory.free;
                  const over = resizeForm.memoryMb > max;
                  return (
                    <p
                      className={`text-[11px] ${over ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      Node: {fmtGb(capacity.memory.used)}/
                      {fmtGb(capacity.memory.total)} used · max {fmtGb(max)}
                      {over && " — exceeds free capacity"}
                    </p>
                  );
                })()}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">CPU (cores)</Label>
              <Input
                type="number"
                min={0.1}
                step={0.5}
                value={resizeForm.cpuCores}
                onChange={(e) =>
                  setResizeForm((f) => ({
                    ...f,
                    cpuCores: Number(e.target.value),
                  }))
                }
              />
              {capacity &&
                (() => {
                  const max = (resizeTarget?.cpuCores ?? 0) + capacity.cpu.free;
                  const over = resizeForm.cpuCores > max;
                  return (
                    <p
                      className={`text-[11px] ${over ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      Node: {capacity.cpu.used.toFixed(1)}/
                      {capacity.cpu.total.toFixed(1)} used · max{" "}
                      {max.toFixed(1)}
                      {over && " — exceeds free capacity"}
                    </p>
                  );
                })()}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Disk (MB)</Label>
              <Input
                type="number"
                min={1024}
                value={resizeForm.diskMb}
                onChange={(e) =>
                  setResizeForm((f) => ({
                    ...f,
                    diskMb: Number(e.target.value),
                  }))
                }
              />
              {capacity &&
                (() => {
                  const max = (resizeTarget?.diskMb ?? 0) + capacity.disk.free;
                  const over = resizeForm.diskMb > max;
                  return (
                    <p
                      className={`text-[11px] ${over ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      Node: {fmtGb(capacity.disk.used)}/
                      {fmtGb(capacity.disk.total)} used · max {fmtGb(max)}
                      {over && " — exceeds free capacity"}
                    </p>
                  );
                })()}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Swap (MB)</Label>
              <Input
                type="number"
                min={0}
                value={resizeForm.swapMb}
                onChange={(e) =>
                  setResizeForm((f) => ({
                    ...f,
                    swapMb: Number(e.target.value),
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResizeTarget(null)}>
              Cancel
            </Button>
            <Button
              loading={resizeMutation.isPending}
              onClick={() => resizeMutation.mutate()}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete server confirmation */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete server</DialogTitle>
            <DialogDescription>
              Delete server {deleteTarget?.name}? This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/[0.06] p-3 text-xs text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <span>
              This removes the server only — it does <strong>not</strong> cancel
              its subscription. Billing keeps renewing until you cancel the
              subscription under the customer&apos;s Billing.
            </span>
          </div>
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
              Delete server
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
