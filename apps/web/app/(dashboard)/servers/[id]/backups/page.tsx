"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Plus,
  MoreHorizontal,
  Download,
  RotateCcw,
  Lock,
  LockOpen,
  Trash2,
  CloudUpload,
  CalendarClock,
  ArrowRight,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Badge, type BadgeProps } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { formatBytes, formatRelative } from "@/lib/utils";
import type { Backup, BackupState } from "@/lib/types";

const stateMap: Record<
  BackupState,
  { label: string; variant: BadgeProps["variant"]; pulse?: boolean }
> = {
  COMPLETED: { label: "Completed", variant: "success" },
  IN_PROGRESS: { label: "In progress", variant: "warning", pulse: true },
  PENDING: { label: "Pending", variant: "warning", pulse: true },
  FAILED: { label: "Failed", variant: "destructive" },
};

function BackupStateBadge({ state }: { state: BackupState }) {
  const cfg = stateMap[state] ?? { label: state, variant: "muted" as const };
  return (
    <Badge variant={cfg.variant}>
      {cfg.pulse && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {cfg.label}
    </Badge>
  );
}

export default function BackupsPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [ignored, setIgnored] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Backup | null>(null);

  const { data: backups, isLoading } = useQuery({
    queryKey: ["backups", id],
    queryFn: () => api.servers.backups.list(id),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["backups", id] });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      api.servers.backups.create(id, {
        name: name.trim(),
        ignoredFiles: ignored
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      toast.success("Backup started. It will appear once it begins processing.");
      setCreateOpen(false);
      setName("");
      setIgnored("");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to create backup"),
  });

  const restoreMutation = useMutation({
    mutationFn: (backupId: string) => api.servers.backups.restore(id, backupId),
    onSuccess: () => {
      toast.success("Restore started. Your server files are being replaced.");
      setRestoreTarget(null);
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to restore backup"),
  });

  const lockMutation = useMutation({
    mutationFn: ({ backupId, locked }: { backupId: string; locked: boolean }) =>
      api.servers.backups.lock(id, backupId, locked),
    onSuccess: (_data, vars) => {
      toast.success(vars.locked ? "Backup locked" : "Backup unlocked");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to update backup"),
  });

  const deleteMutation = useMutation({
    mutationFn: (backupId: string) => api.servers.backups.delete(id, backupId),
    onSuccess: () => {
      toast.success("Backup deleted");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to delete backup"),
  });

  const downloadMutation = useMutation({
    mutationFn: (backupId: string) => api.servers.backups.downloadUrl(id, backupId),
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to get download link"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Backups"
        description="Point-in-time snapshots of your server, stored safely offsite."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Create backup
          </Button>
        }
      />

      {/* Informational notes */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="bg-muted/30">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <CloudUpload className="mt-0.5 size-5 shrink-0 text-primary" />
            <p className="text-muted-foreground">
              Backups are stored offsite in encrypted S3 object storage, separate from your
              node. Locked backups are kept indefinitely and excluded from automatic
              rotation.
            </p>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <CalendarClock className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="space-y-1 text-muted-foreground">
              <p>Want automatic, recurring backups?</p>
              <Link
                href="../schedules"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                Set up scheduled backups <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : backups?.length ? (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Size</TableHead>
                <TableHead className="hidden md:table-cell">Created</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.map((backup) => {
                const completed = backup.state === "COMPLETED";
                return (
                  <TableRow key={backup.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Archive className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium">{backup.name}</span>
                        {backup.isLocked && (
                          <Lock
                            className="size-3.5 shrink-0 text-muted-foreground"
                            aria-label="Locked"
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <BackupStateBadge state={backup.state} />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {completed ? formatBytes(backup.sizeBytes) : "—"}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {formatRelative(backup.createdAt)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label="Actions">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {completed && (
                            <DropdownMenuItem
                              onSelect={() => downloadMutation.mutate(backup.id)}
                            >
                              <Download /> Download
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            disabled={!completed}
                            onSelect={() => setRestoreTarget(backup)}
                          >
                            <RotateCcw /> Restore
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              lockMutation.mutate({
                                backupId: backup.id,
                                locked: !backup.isLocked,
                              })
                            }
                          >
                            {backup.isLocked ? (
                              <>
                                <LockOpen /> Unlock
                              </>
                            ) : (
                              <>
                                <Lock /> Lock
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            destructive
                            disabled={backup.isLocked}
                            onSelect={() => setDeleteTarget(backup)}
                          >
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <EmptyState
          icon={Archive}
          title="No backups yet"
          description="Create your first backup to capture the current state of your server. Backups are stored offsite so you can always roll back."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Create backup
            </Button>
          }
        />
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create backup</DialogTitle>
            <DialogDescription>
              Snapshot your server&apos;s files. This may take a few minutes depending on
              size.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="backup-name">Name</Label>
              <Input
                id="backup-name"
                autoFocus
                placeholder="Pre-update snapshot"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="backup-ignored">Ignored files (optional)</Label>
              <Textarea
                id="backup-ignored"
                placeholder={"node_modules\n*.log\ncache/"}
                value={ignored}
                onChange={(e) => setIgnored(e.target.value)}
                className="min-h-[96px] font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                One pattern per line. Matching files are excluded from the backup.
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
              Create backup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore confirm */}
      <Dialog open={!!restoreTarget} onOpenChange={(o) => !o && setRestoreTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore backup?</DialogTitle>
            <DialogDescription>
              Restoring <strong>{restoreTarget?.name}</strong> will overwrite the current
              files on your server with the contents of this backup. Any changes made since
              the backup was taken will be lost. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRestoreTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={restoreMutation.isPending}
              onClick={() => restoreTarget && restoreMutation.mutate(restoreTarget.id)}
            >
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete backup?</DialogTitle>
            <DialogDescription>
              <strong>{deleteTarget?.name}</strong> will be permanently removed from offsite
              storage. This cannot be undone.
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
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
