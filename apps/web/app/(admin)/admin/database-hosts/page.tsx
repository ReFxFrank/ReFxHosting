"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Plus, Trash2, Plug, CheckCircle2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import type { DatabaseHost, DatabaseHostInput } from "@/lib/types";

const emptyForm: DatabaseHostInput = {
  name: "",
  engine: "MARIADB",
  host: "",
  port: 3306,
  username: "",
  password: "",
  publicHost: "",
  maxDatabases: 500,
  isActive: true,
};

export default function AdminDatabaseHostsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<DatabaseHostInput>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<DatabaseHost | null>(null);

  const { data: hosts, isLoading } = useQuery({
    queryKey: ["admin", "database-hosts"],
    queryFn: () => api.admin.databaseHosts(),
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "database-hosts"] });

  const createMutation = useMutation({
    mutationFn: () => api.admin.createDatabaseHost(form),
    onSuccess: () => {
      toast.success("Database host added");
      invalidate();
      setCreateOpen(false);
      setForm(emptyForm);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to add host"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.admin.deleteDatabaseHost(id),
    onSuccess: () => {
      toast.success("Host removed");
      invalidate();
      setDeleteTarget(null);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to remove host"),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => api.admin.testDatabaseHost(id),
    onSuccess: () => toast.success("Connection OK"),
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Connection failed"),
  });

  const set = <K extends keyof DatabaseHostInput>(
    k: K,
    v: DatabaseHostInput[K],
  ) => setForm((f) => ({ ...f, [k]: v }));

  const canCreate =
    form.name.trim() &&
    form.host.trim() &&
    form.username.trim() &&
    form.password?.trim() &&
    form.publicHost.trim();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Database Hosts"
        description="Shared MySQL/MariaDB servers the panel provisions per-server databases on."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Add host
          </Button>
        }
      />

      {isLoading ? (
        <ListSkeleton />
      ) : !hosts?.length ? (
        <EmptyState
          icon={Database}
          title="No database hosts yet"
          description="Add a MySQL/MariaDB host so customers can create databases for their servers."
        />
      ) : (
        <div className="space-y-3">
          {hosts.map((h) => (
            <Card key={h.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 space-y-0.5">
                  <p className="flex items-center gap-2 font-medium">
                    {h.name}
                    <Badge variant={h.isActive ? "success" : "muted"}>
                      {h.isActive ? "Active" : "Disabled"}
                    </Badge>
                    <Badge variant="secondary">{h.engine}</Badge>
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    admin {h.username}@{h.host}:{h.port} · public {h.publicHost}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {h.databaseCount ?? 0} / {h.maxDatabases} databases
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    loading={
                      testMutation.isPending && testMutation.variables === h.id
                    }
                    onClick={() => testMutation.mutate(h.id)}
                  >
                    <Plug className="size-4" /> Test
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(h)}
                    aria-label="Remove host"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add host dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add database host</DialogTitle>
            <DialogDescription>
              The admin credentials run the CREATE/DROP/GRANT DDL and are stored
              encrypted. Customers connect to the public host.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field label="Engine">
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={form.engine}
                onChange={(e) => set("engine", e.target.value)}
              >
                <option value="MARIADB">MariaDB</option>
                <option value="MYSQL">MySQL</option>
              </select>
            </Field>
            <Field label="Admin host">
              <Input
                placeholder="10.0.0.5"
                value={form.host}
                onChange={(e) => set("host", e.target.value)}
              />
            </Field>
            <Field label="Port">
              <Input
                type="number"
                value={form.port}
                onChange={(e) => set("port", Number(e.target.value))}
              />
            </Field>
            <Field label="Admin user">
              <Input
                value={form.username}
                onChange={(e) => set("username", e.target.value)}
              />
            </Field>
            <Field label="Admin password">
              <Input
                type="password"
                autoComplete="new-password"
                value={form.password ?? ""}
                onChange={(e) => set("password", e.target.value)}
              />
            </Field>
            <Field label="Public host (customers connect to)">
              <Input
                placeholder="db.refx.gg"
                value={form.publicHost}
                onChange={(e) => set("publicHost", e.target.value)}
              />
            </Field>
            <Field label="Max databases">
              <Input
                type="number"
                value={form.maxDatabases}
                onChange={(e) => set("maxDatabases", Number(e.target.value))}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={createMutation.isPending}
              disabled={!canCreate}
              onClick={() => createMutation.mutate()}
            >
              <CheckCircle2 className="size-4" /> Add host
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove database host</DialogTitle>
            <DialogDescription>
              Remove <span className="font-medium">{deleteTarget?.name}</span>?
              Hosts with existing databases can&apos;t be removed until those
              are deleted.
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
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
