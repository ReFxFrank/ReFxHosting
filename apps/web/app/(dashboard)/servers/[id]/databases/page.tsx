"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Database,
  Plus,
  MoreVertical,
  KeyRound,
  Link2,
  Trash2,
  Copy,
  Check,
  TriangleAlert,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import type { DbEngine, ServerDatabase } from "@/lib/types";

const ENGINES: { value: DbEngine; label: string }[] = [
  { value: "MYSQL", label: "MySQL" },
  { value: "MARIADB", label: "MariaDB" },
  { value: "POSTGRESQL", label: "PostgreSQL" },
];

function engineLabel(engine: DbEngine) {
  return ENGINES.find((e) => e.value === engine)?.label ?? engine;
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size={label ? "sm" : "icon-sm"}
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
      {label}
    </Button>
  );
}

export default function DatabasesPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [engine, setEngine] = useState<DbEngine>("MYSQL");
  const [name, setName] = useState("");
  const [remoteAccess, setRemoteAccess] = useState("%");

  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [connDetails, setConnDetails] = useState<ServerDatabase | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServerDatabase | null>(null);

  const { data: databases, isLoading } = useQuery({
    queryKey: ["databases", id],
    queryFn: () => api.servers.databases.list(id),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["databases", id] });

  const createMutation = useMutation({
    mutationFn: () =>
      api.servers.databases.create(id, { engine, name, remoteAccess }),
    onSuccess: (db) => {
      toast.success("Database created");
      invalidate();
      setCreateOpen(false);
      setName("");
      setRemoteAccess("%");
      if (db.password) setNewPassword(db.password);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to create database"),
  });

  const rotateMutation = useMutation({
    mutationFn: (dbId: string) => api.servers.databases.rotatePassword(id, dbId),
    onSuccess: (res) => {
      toast.success("Password rotated");
      setNewPassword(res.password);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to rotate password"),
  });

  const deleteMutation = useMutation({
    mutationFn: (dbId: string) => api.servers.databases.delete(id, dbId),
    onSuccess: () => {
      toast.success("Database deleted");
      invalidate();
      setDeleteTarget(null);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to delete database"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Databases"
        description="Create and manage MySQL, MariaDB and PostgreSQL databases for your server."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Create database
          </Button>
        }
      />

      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : databases?.length ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Engine</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Remote access</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {databases.map((db) => (
                  <TableRow key={db.id}>
                    <TableCell className="font-medium">{db.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{engineLabel(db.engine)}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{db.username}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {db.host}:{db.port}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{db.remoteAccess}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm">
                            <MoreVertical className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => rotateMutation.mutate(db.id)}
                          >
                            <KeyRound /> Rotate password
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setConnDetails(db)}>
                            <Link2 /> Connection details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            destructive
                            onSelect={() => setDeleteTarget(db)}
                          >
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={Database}
          title="No databases yet"
          description="Create your first database to store persistent data for plugins, mods or your game."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Create database
            </Button>
          }
        />
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create database</DialogTitle>
            <DialogDescription>
              A new database and dedicated user will be provisioned on your node.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Engine</Label>
              <Select value={engine} onValueChange={(v) => setEngine(v as DbEngine)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENGINES.map((e) => (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="db-name">Name</Label>
              <Input
                id="db-name"
                placeholder="my_database"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="db-remote">Remote access</Label>
              <Input
                id="db-remote"
                placeholder="%"
                value={remoteAccess}
                onChange={(e) => setRemoteAccess(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Hosts allowed to connect. Use <code>%</code> to allow any host.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={createMutation.isPending}
              disabled={!name.trim()}
              onClick={() => createMutation.mutate()}
            >
              Create database
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* One-time password dialog (create + rotate) */}
      <Dialog open={!!newPassword} onOpenChange={(o) => !o && setNewPassword(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Database password</DialogTitle>
            <DialogDescription>
              Copy this password now — it will not be shown again.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              Store this somewhere safe. For security reasons we don&apos;t keep a copy
              and you&apos;ll need to rotate it if lost.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-md border bg-muted/50 px-3 py-2 font-mono text-sm">
              {newPassword}
            </code>
            {newPassword && <CopyButton value={newPassword} />}
          </div>

          <DialogFooter>
            <Button onClick={() => setNewPassword(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Connection details dialog */}
      <Dialog open={!!connDetails} onOpenChange={(o) => !o && setConnDetails(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connection details</DialogTitle>
            <DialogDescription>
              Use these credentials to connect to <strong>{connDetails?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          {connDetails && (
            <dl className="space-y-3">
              {[
                { label: "Host", value: connDetails.host },
                { label: "Port", value: String(connDetails.port) },
                { label: "Username", value: connDetails.username },
                { label: "Database", value: connDetails.name },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-2">
                  <dt className="w-24 text-sm text-muted-foreground">{row.label}</dt>
                  <dd className="flex-1 truncate font-mono text-sm">{row.value}</dd>
                  <CopyButton value={row.value} />
                </div>
              ))}
            </dl>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConnDetails(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete database</DialogTitle>
            <DialogDescription>
              This permanently deletes <strong>{deleteTarget?.name}</strong> and all of its
              data. This cannot be undone.
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
              Delete database
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
