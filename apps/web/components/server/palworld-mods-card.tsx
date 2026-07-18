"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  Trash2,
  Puzzle,
  Info,
  Lock,
  Package,
} from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
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
import { hasServerPermission } from "@/lib/server-permissions";
import type { PalworldMod, Server } from "@/lib/types";

const KIND_LABEL: Record<PalworldMod["kind"], string> = {
  lua: "Lua",
  dll: "C++",
  blueprint: "Blueprint",
  other: "Mod",
};

/** Match the backend's accepted archive name (no traversal, alnum start). The
 * dot-collapse mirrors the server's `..` rejection so a valid file never 400s. */
function sanitizeZipName(name: string): string {
  let s = name.replace(/[^A-Za-z0-9 _.\-]/g, "_").replace(/\.{2,}/g, ".");
  if (!/^[A-Za-z0-9]/.test(s)) s = `m${s}`;
  if (!/\.zip$/i.test(s)) s = `${s}.zip`;
  return s;
}

/**
 * UE4SS mod manager for the Windows/Proton Palworld egg: upload a mod .zip,
 * enable/disable, and remove — all via the panel instead of SFTP. Changes apply
 * on the next server start (UE4SS loads mods at boot).
 */
export function PalworldModsCard({ server }: { server: Server }) {
  const id = server.id;
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const canWrite = hasServerPermission(server.viewerPermissions, "files.write");

  const { data, isLoading, error } = useQuery({
    queryKey: ["palworld-mods", id],
    queryFn: () => api.servers.palworldMods(id),
    retry: false,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["palworld-mods", id] });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!/\.zip$/i.test(file.name)) {
        throw new Error("Upload a .zip that contains the mod's folder.");
      }
      const safe = sanitizeZipName(file.name);
      await api.servers.files.upload(id, `${data!.modsDir}/${safe}`, file);
      return api.servers.installPalworldMod(id, safe);
    },
    onSuccess: () => {
      toast.success("Mod installed — restart the server to load it.");
      invalidate();
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError
          ? e.message
          : (e as Error)?.message || "Couldn't install the mod",
      ),
  });

  const toggle = useMutation({
    mutationFn: (v: { name: string; enabled: boolean }) =>
      api.servers.setPalworldModEnabled(id, v.name, v.enabled),
    onSuccess: () => invalidate(),
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Couldn't change the mod",
      ),
  });

  const remove = useMutation({
    mutationFn: (name: string) => api.servers.removePalworldMod(id, name),
    onSuccess: () => {
      toast.success("Mod removed — restart to apply.");
      setConfirmDelete(null);
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Couldn't remove the mod"),
  });

  const pickFile = () => fileRef.current?.click();
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (f) upload.mutate(f);
  };

  if (isLoading) return <Skeleton className="h-72 w-full" />;

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          {error instanceof ApiError
            ? error.message
            : "Couldn't read the UE4SS mods folder."}
        </CardContent>
      </Card>
    );
  }

  if (!data.installed) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center text-sm text-muted-foreground">
          <Package className="size-6" />
          <p>
            UE4SS isn&apos;t set up on this server yet. <strong>Reinstall</strong>{" "}
            the server (Settings → Update) to bootstrap the mod loader, then come
            back here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          Upload a UE4SS mod as a <span className="font-mono">.zip</span>{" "}
          containing the mod&apos;s folder (with{" "}
          <span className="font-mono">scripts/main.lua</span> or{" "}
          <span className="font-mono">dlls/main.dll</span>). Changes apply on the
          next <strong>restart</strong>. Server-side mods take effect for everyone
          — connecting players don&apos;t need to install anything. Blueprint{" "}
          <span className="font-mono">.pak</span> mods go in{" "}
          <span className="font-mono">Pal/Content/Paks/LogicMods/</span> via the
          file manager. Max upload 32&nbsp;MiB (use SFTP for larger).
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {data.mods.length === 0
            ? "No mods installed yet."
            : `${data.mods.length} mod${data.mods.length === 1 ? "" : "s"} in ue4ss/Mods.`}
        </p>
        {canWrite && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={onFile}
            />
            <Button loading={upload.isPending} onClick={pickFile}>
              <Upload className="size-4" /> Upload mod (.zip)
            </Button>
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Puzzle className="size-4" /> Installed mods
          </CardTitle>
          <CardDescription>
            Toggle to enable/disable; built-in UE4SS mods are locked.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.mods.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing here yet — upload a mod to get started.
            </p>
          ) : (
            <ul className="divide-y divide-white/5">
              {data.mods.map((m) => (
                <li
                  key={m.name}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{m.name}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {KIND_LABEL[m.kind]}
                      </Badge>
                      {m.builtin && (
                        <Badge
                          variant="muted"
                          className="shrink-0 gap-1 text-[10px] font-normal"
                        >
                          <Lock className="size-2.5" /> built-in
                        </Badge>
                      )}
                    </div>
                  </div>

                  <span className="text-xs text-muted-foreground">
                    {m.enabled ? "Enabled" : "Disabled"}
                  </span>
                  <Switch
                    checked={m.enabled}
                    disabled={m.builtin || !canWrite || toggle.isPending}
                    onCheckedChange={(enabled) =>
                      toggle.mutate({ name: m.name, enabled })
                    }
                    aria-label={`Toggle ${m.name}`}
                  />
                  {canWrite && !m.builtin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setConfirmDelete(m.name)}
                      aria-label={`Remove ${m.name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this mod?</DialogTitle>
            <DialogDescription>
              This permanently deletes{" "}
              <span className="font-mono">{confirmDelete}</span> from{" "}
              <span className="font-mono">ue4ss/Mods</span>. Restart the server to
              apply.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={remove.isPending}
              onClick={() => confirmDelete && remove.mutate(confirmDelete)}
            >
              Remove mod
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
