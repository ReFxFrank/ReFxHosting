"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Blocks } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
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
import type { Server } from "@/lib/types";

const MC_LOADERS = [
  { value: "vanilla", label: "Vanilla" },
  { value: "paper", label: "Paper" },
  { value: "fabric", label: "Fabric" },
  { value: "forge", label: "Forge" },
  { value: "neoforge", label: "NeoForge" },
] as const;

const LOADER_NEEDS_BUILD = new Set(["fabric", "forge", "neoforge"]);

/**
 * Loader + version control for Minecraft servers. For the unified `minecraft`
 * egg it offers the full loader picker (vanilla/paper/fabric/forge/neoforge);
 * for legacy per-loader eggs it falls back to a version-only change. Applying
 * reinstalls the server (world preserved) and auto-selects the matching JVM.
 */
export function MinecraftConfigCard({ server }: { server: Server }) {
  const queryClient = useQueryClient();
  const unified = server.template?.slug === "minecraft";

  const currentLoader = server.environment?.LOADER ?? "paper";
  const currentVersion = server.environment?.MINECRAFT_VERSION ?? "latest";
  const currentLoaderVersion = server.environment?.LOADER_VERSION ?? "latest";

  const [loader, setLoader] = useState(currentLoader);
  const [version, setVersion] = useState(currentVersion);
  const [loaderVersion, setLoaderVersion] = useState(currentLoaderVersion);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: mcVersions } = useQuery({
    queryKey: ["catalog", "minecraft-versions"],
    queryFn: () => api.catalog.minecraftVersions(),
  });

  const changeMutation = useMutation({
    mutationFn: () =>
      unified
        ? api.servers.setMinecraft(server.id, { loader, version, loaderVersion })
        : api.servers.changeMinecraftVersion(server.id, version),
    onSuccess: () => {
      toast.success("Reinstalling — your world is preserved");
      queryClient.invalidateQueries({ queryKey: ["server", server.id] });
      setConfirmOpen(false);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to apply changes"),
  });

  const dirty = unified
    ? loader !== currentLoader ||
      version !== currentVersion ||
      loaderVersion !== currentLoaderVersion
    : version !== currentVersion;
  const versionList = mcVersions?.versions ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Blocks className="size-4 text-primary" />{" "}
          {unified ? "Loader & version" : "Minecraft version"}
        </CardTitle>
        <CardDescription>
          {unified
            ? "Choose your server software (Vanilla, Paper, Fabric, Forge, NeoForge) and version. Applying reinstalls the server (world & files preserved) and auto-selects the matching Java runtime."
            : "Change the installed version. Reinstalls the server (world & files preserved) and auto-selects the matching Java runtime."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {unified && (
            <div className="space-y-1.5">
              <Label>Loader</Label>
              <Select value={loader} onValueChange={setLoader}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MC_LOADERS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Minecraft version</Label>
            <Select value={version} onValueChange={setVersion}>
              <SelectTrigger>
                <SelectValue placeholder="Select version" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">Latest (recommended)</SelectItem>
                {version !== "latest" && !versionList.includes(version) && (
                  <SelectItem value={version}>{version} (current)</SelectItem>
                )}
                {versionList.map((ver) => (
                  <SelectItem key={ver} value={ver}>
                    {ver}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {unified && LOADER_NEEDS_BUILD.has(loader) && (
            <div className="space-y-1.5">
              <Label>{MC_LOADERS.find((l) => l.value === loader)?.label} build</Label>
              <Input
                value={loaderVersion}
                onChange={(e) => setLoaderVersion(e.target.value)}
                placeholder="latest"
                className="font-mono text-sm"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Current:{" "}
            <span className="font-mono">
              {unified ? `${currentLoader} · ` : ""}
              {currentVersion}
            </span>
          </p>
          <Button disabled={!dirty} onClick={() => setConfirmOpen(true)}>
            Apply &amp; reinstall
          </Button>
        </div>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Minecraft changes</DialogTitle>
            <DialogDescription>
              The server will reinstall on{" "}
              <span className="font-mono">
                {unified ? `${loader} ` : ""}
                {version}
              </span>{" "}
              and be briefly offline. Your world and files are preserved, but a
              backup first is always wise.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={changeMutation.isPending}
              onClick={() => changeMutation.mutate()}
            >
              Apply &amp; reinstall
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
