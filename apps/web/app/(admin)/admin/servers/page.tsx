"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HardDrive, Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ServerStateBadge } from "@/components/ui/badge";
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
import type { AdminServer, GameTemplate } from "@/lib/types";

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
  // Minecraft version selection (only sent for minecraft-* templates).
  minecraftVersion: "latest",
};

export default function AdminServersPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<AdminServer | null>(null);

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

  const selectedTemplate: GameTemplate | undefined = templates?.find(
    (t) => t.id === form.templateId,
  );
  const isMinecraft = !!selectedTemplate?.slug?.startsWith("minecraft-");

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
        cpuCores: form.cpuCores,
        memoryMb: form.memoryMb,
        diskMb: form.diskMb,
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
      toast.error(e instanceof ApiError ? e.message : "Failed to create server"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.admin.deleteServer(id),
    onSuccess: () => {
      toast.success("Server deleted");
      invalidate();
      setDeleteTarget(null);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to delete server"),
  });

  const canSubmit =
    form.name.trim() &&
    form.ownerId &&
    form.nodeId &&
    form.templateId &&
    form.cpuCores > 0 &&
    form.memoryMb >= 256 &&
    form.diskMb >= 1024;

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
                  <TableHead className="w-10" />
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
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(s)}
                      >
                        <Trash2 className="size-4" />
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
              Provision a server from an egg. Resources prefill from the template&apos;s
              recommended values and can be overridden.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="srv-name">Name</Label>
              <Input
                id="srv-name"
                placeholder="My game server"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
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
                      {t.category?.name ? `${t.category.name} · ${t.name}` : t.name}
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
                    setForm((f) => ({ ...f, cpuCores: Number(e.target.value) }))
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
                    setForm((f) => ({ ...f, memoryMb: Number(e.target.value) }))
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

      {/* Delete server confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete server</DialogTitle>
            <DialogDescription>
              Delete server {deleteTarget?.name}? This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Delete server
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
