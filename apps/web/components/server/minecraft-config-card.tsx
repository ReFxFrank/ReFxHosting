"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Blocks, TriangleAlert } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
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

/** Mod ecosystems that are NOT world/mod-compatible with each other. Switching
 * between families means the current world + mods won't load on the new loader
 * (Forge jars won't run on Fabric; modded worldgen won't load on vanilla, …). */
function loaderFamily(loader: string): string {
  if (loader === "fabric" || loader === "quilt") return "fabric";
  if (loader === "forge") return "forge";
  if (loader === "neoforge") return "neoforge";
  if (loader === "paper") return "paper";
  return "vanilla";
}

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
  const [freshStart, setFreshStart] = useState(false);

  const needsBuild = LOADER_NEEDS_BUILD.has(loader);

  // Switching mod ecosystem (e.g. Forge↔Fabric, modded↔vanilla) leaves the old
  // world + mods incompatible with the new loader — they'll crash it. We warn and
  // default the "start fresh" reset ON for that case.
  const familyChanged =
    unified && loaderFamily(loader) !== loaderFamily(currentLoader);

  // Minecraft versions for the SELECTED loader (forge/fabric/neoforge each
  // support a different set), refetched whenever the loader changes.
  const { data: mcVersions } = useQuery({
    queryKey: ["catalog", "minecraft-versions", unified ? loader : "_legacy"],
    queryFn: () => api.catalog.minecraftVersions(unified ? loader : undefined),
  });

  // Loader build versions for the selected loader + Minecraft version (Fabric
  // loader / Forge build / NeoForge build). Skipped for vanilla/paper.
  const { data: mcBuilds } = useQuery({
    queryKey: ["catalog", "minecraft-builds", loader, version],
    queryFn: () => api.catalog.minecraftBuilds(loader, version),
    enabled: unified && needsBuild,
  });

  // Changing the loader invalidates the picked version+build (the new loader may
  // not support them); changing the version invalidates the build. Reset them so
  // we never submit a combo the loader doesn't have.
  const changeLoader = (v: string) => {
    setLoader(v);
    setVersion("latest");
    setLoaderVersion("latest");
  };
  const changeVersion = (v: string) => {
    setVersion(v);
    setLoaderVersion("latest");
  };

  const changeMutation = useMutation({
    mutationFn: () =>
      unified
        ? api.servers.setMinecraft(server.id, {
            loader,
            version,
            loaderVersion,
            freshStart,
          })
        : api.servers.changeMinecraftVersion(server.id, version),
    onSuccess: () => {
      toast.success(
        freshStart
          ? "Reinstalling with a fresh world & files"
          : "Reinstalling — your world is preserved",
      );
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
              <Select value={loader} onValueChange={changeLoader}>
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
            <Select value={version} onValueChange={changeVersion}>
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
          {unified && needsBuild && (
            <div className="space-y-1.5">
              <Label>{MC_LOADERS.find((l) => l.value === loader)?.label} build</Label>
              <Select value={loaderVersion} onValueChange={setLoaderVersion}>
                <SelectTrigger>
                  <SelectValue placeholder="Select build" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="latest">Latest (recommended)</SelectItem>
                  {loaderVersion !== "latest" &&
                    !(mcBuilds?.builds ?? []).includes(loaderVersion) && (
                      <SelectItem value={loaderVersion}>
                        {loaderVersion} (current)
                      </SelectItem>
                    )}
                  {(mcBuilds?.builds ?? []).map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          <Button
            disabled={!dirty}
            onClick={() => {
              // Default the reset ON when the loader family changes (incompatible
              // world/mods), OFF for a same-family version bump.
              setFreshStart(familyChanged);
              setConfirmOpen(true);
            }}
          >
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
              and be briefly offline.
            </DialogDescription>
          </DialogHeader>

          {familyChanged && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>
                You&apos;re switching from{" "}
                <span className="font-medium text-foreground">
                  {currentLoader}
                </span>{" "}
                to{" "}
                <span className="font-medium text-foreground">{loader}</span> —
                a different mod ecosystem. Your existing world and mods
                won&apos;t load on the new loader and will crash it. Starting
                fresh is strongly recommended.
              </span>
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[hsl(var(--primary))]"
              checked={freshStart}
              onChange={(e) => setFreshStart(e.target.checked)}
            />
            <span className="space-y-0.5">
              <span className="block font-medium">
                Reset the world &amp; files (start fresh)
              </span>
              <span className="block text-xs text-muted-foreground">
                {freshStart
                  ? "The server will be wiped and reinstalled clean — no world or files carry over."
                  : "Your world and files are preserved. Back up first — a backup is always wise."}
              </span>
            </span>
          </label>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={freshStart ? "destructive" : "default"}
              loading={changeMutation.isPending}
              onClick={() => changeMutation.mutate()}
            >
              {freshStart ? "Reset & reinstall" : "Apply & reinstall"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
