"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LifeBuoy, ShieldAlert, CheckCircle2, AlertTriangle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { formatBytes } from "@/lib/utils";
import { hasServerPermission } from "@/lib/server-permissions";
import type { Server } from "@/lib/types";

/**
 * One-click recovery for the corrupt-level.dat crash ("Failed to load
 * datapacks" / "No key dimensions/seed in MapLike[{}]"). Reads the level.dat /
 * level.dat_old state and, when the server is stopped, promotes Minecraft's own
 * previous-save backup back into place.
 */
export function WorldRecoveryCard({ server }: { server: Server }) {
  const id = server.id;
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const canWrite = hasServerPermission(server.viewerPermissions, "files.write");
  const stopped = server.state === "OFFLINE" || server.state === "CRASHED";

  const { data: status, isLoading, error } = useQuery({
    queryKey: ["level-dat-status", id],
    queryFn: () => api.servers.levelDatStatus(id),
    retry: false,
  });

  const restore = useMutation({
    mutationFn: () => api.servers.restoreLevelDat(id),
    onSuccess: (res) => {
      toast.success(
        res.preservedAs
          ? `Restored level.dat (corrupt copy saved as ${res.preservedAs}). Start the server to test.`
          : "Restored level.dat. Start the server to test.",
      );
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["level-dat-status", id] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Failed to restore level.dat",
      ),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LifeBuoy className="size-5" /> World recovery
        </CardTitle>
        <CardDescription>
          If the server won’t boot with “Failed to load datapacks” or “No key
          dimensions/seed”, your <span className="font-mono">level.dat</span> is
          corrupt. Restore Minecraft’s own last-good copy (
          <span className="font-mono">level.dat_old</span>) in one click.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : error ? (
          <p className="text-sm text-muted-foreground">
            {error instanceof ApiError
              ? error.message
              : "Couldn’t read the world folder."}
          </p>
        ) : status ? (
          <>
            {/* Health summary */}
            <div className="flex flex-wrap items-center gap-2">
              {status.looksCorrupt ? (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="size-3.5" />
                  level.dat missing or empty
                </Badge>
              ) : (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="size-3.5" />
                  level.dat looks OK
                </Badge>
              )}
              <Badge variant={status.hasBackup ? "secondary" : "muted"}>
                {status.hasBackup
                  ? "Backup available (level.dat_old)"
                  : "No level.dat_old backup"}
              </Badge>
              <Badge variant="outline" className="font-mono">
                world: {status.world}
              </Badge>
            </div>

            <dl className="grid grid-cols-2 gap-2 text-sm sm:max-w-md">
              <dt className="text-muted-foreground">Current level.dat</dt>
              <dd className="font-mono">
                {status.hasLevelDat
                  ? formatBytes(status.levelDatBytes ?? 0)
                  : "missing"}
              </dd>
              <dt className="text-muted-foreground">Backup level.dat_old</dt>
              <dd className="font-mono">
                {status.hasBackup
                  ? formatBytes(status.backupBytes ?? 0)
                  : "missing"}
              </dd>
            </dl>

            {!status.restorable && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>
                  No usable <span className="font-mono">level.dat_old</span> to
                  restore from. Recover from the <strong>Backups</strong> tab
                  instead.
                </span>
              </div>
            )}

            {status.restorable && !stopped && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>
                  Stop the server first — a running server rewrites{" "}
                  <span className="font-mono">level.dat</span> on save, which
                  would undo the restore.
                </span>
              </div>
            )}

            {canWrite && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  disabled={!status.restorable || !stopped}
                  onClick={() => setConfirmOpen(true)}
                >
                  <LifeBuoy className="size-4" /> Restore last good level.dat
                </Button>
              </div>
            )}
          </>
        ) : null}
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore last good level.dat?</DialogTitle>
            <DialogDescription>
              This promotes <span className="font-mono">level.dat_old</span> (
              {formatBytes(status?.backupBytes ?? 0)}) back to{" "}
              <span className="font-mono">level.dat</span> in{" "}
              <span className="font-mono">{status?.world}</span>. The current
              corrupt file is preserved as{" "}
              <span className="font-mono">level.dat.corrupt-…</span> so nothing
              is lost. You’ll lose at most the few minutes since the last save.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={restore.isPending}
              onClick={() => restore.mutate()}
            >
              Restore level.dat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
