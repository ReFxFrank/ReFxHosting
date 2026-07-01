"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Download,
  ArrowDownToLine,
  ExternalLink,
  AlertTriangle,
  Package,
  Trash2,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { formatDate } from "@/lib/utils";
import type { ModrinthProject, InstalledModpack } from "@/lib/types";

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function ModpacksPage() {
  const { id } = useParams<{ id: string }>();
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const [picker, setPicker] = useState<ModrinthProject | null>(null);

  const search = useQuery({
    queryKey: ["server", id, "modpacks", "search", query],
    queryFn: () => api.servers.modpacks.search(id, query),
    retry: false,
  });

  // What's currently installed (null when none). Only meaningful once the server
  // is a unified Minecraft egg, so skip it if the search endpoint rejected it.
  const installed = useQuery({
    queryKey: ["server", id, "modpacks", "installed"],
    queryFn: () => api.servers.modpacks.installed(id),
    enabled: !search.isError,
    retry: false,
  });

  // Non-Minecraft (or legacy-egg) servers can't install modpacks.
  if (search.isError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Modpacks"
          description="Install full modpacks from Modrinth."
        />
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {search.error instanceof ApiError
              ? search.error.message
              : "Modpacks aren't available for this server."}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Modpacks"
        description="Install a complete Modrinth modpack — the server is automatically switched to the pack's Minecraft version and loader."
      />

      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200/90">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>
          Installing a modpack switches this server&apos;s Minecraft version +
          loader, reinstalls it (your worlds are preserved), clears existing
          mods, then downloads the pack&apos;s mods and config. It runs in the
          background — you&apos;ll get a notification when it&apos;s done.
        </p>
      </div>

      {installed.data?.installed && (
        <InstalledCard serverId={id} pack={installed.data.installed} />
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(term.trim());
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search Modrinth modpacks…"
            className="pl-9"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      <p className="-mt-1 text-xs text-muted-foreground">
        Powered by{" "}
        <a
          href="https://modrinth.com/modpacks"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          Modrinth
        </a>
        . CurseForge-exclusive packs (from curseforge.com) aren&apos;t supported
        yet — but many popular packs are on both, so try searching by name.
      </p>

      {search.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : search.data?.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {search.data.map((p) => (
            <Card key={p.projectId} className="overflow-hidden">
              <CardContent className="flex gap-3 p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.iconUrl || "/games/presets/default.svg"}
                  alt=""
                  className="size-12 shrink-0 rounded-lg bg-white/5 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-semibold">{p.title}</p>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <ArrowDownToLine className="size-3" />{" "}
                      {formatCount(p.downloads)}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {p.description}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Button size="sm" onClick={() => setPicker(p)}>
                      <Download className="size-4" /> Install…
                    </Button>
                    <a
                      href={`https://modrinth.com/modpack/${p.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="size-3" /> Modrinth
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {query
              ? `No Modrinth modpacks match “${query}”. This browser searches Modrinth only — CurseForge-exclusive packs can't be installed yet.`
              : "Search for a modpack by name to get started."}
          </CardContent>
        </Card>
      )}

      <VersionPicker
        serverId={id}
        project={picker}
        onClose={() => setPicker(null)}
      />
    </div>
  );
}

function InstalledCard({
  serverId,
  pack,
}: {
  serverId: string;
  pack: InstalledModpack;
}) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);

  const uninstall = useMutation({
    mutationFn: () => api.servers.modpacks.uninstall(serverId),
    onSuccess: () => {
      toast.success("Uninstalling modpack — watch your notifications.");
      setConfirm(false);
      queryClient.invalidateQueries({
        queryKey: ["server", serverId, "modpacks", "installed"],
      });
      queryClient.invalidateQueries({ queryKey: ["server", serverId] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Uninstall failed"),
  });

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex flex-wrap items-center gap-4 p-4">
        <Package className="size-8 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold">
              Installed: {pack.title ?? "Modpack"}
            </p>
            {pack.projectId && (
              <a
                href={`https://modrinth.com/modpack/${pack.projectId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3" /> Modrinth
              </a>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {pack.versionNumber && (
              <Badge variant="muted" className="text-[10px]">
                {pack.versionNumber}
              </Badge>
            )}
            {pack.mcVersion && (
              <Badge variant="muted" className="text-[10px]">
                MC {pack.mcVersion}
              </Badge>
            )}
            {pack.loader && (
              <Badge variant="secondary" className="text-[10px] capitalize">
                {pack.loader}
              </Badge>
            )}
            {typeof pack.filesInstalled === "number" && (
              <span className="ml-1">{pack.filesInstalled} files</span>
            )}
            {pack.installedAt && (
              <span className="ml-1">
                · installed {formatDate(pack.installedAt)}
              </span>
            )}
          </div>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setConfirm(true)}
          disabled={uninstall.isPending}
        >
          <Trash2 className="size-4" /> Uninstall
        </Button>
      </CardContent>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Uninstall {pack.title ?? "modpack"}?</DialogTitle>
            <DialogDescription>
              This clears the pack&apos;s mods from the server. Your world is
              kept, and the current loader/version stay as-is — switch to
              vanilla from the Minecraft tab if you want a clean server. Config
              files the pack added may remain.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={uninstall.isPending}
              onClick={() => uninstall.mutate()}
            >
              Uninstall
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function VersionPicker({
  serverId,
  project,
  onClose,
}: {
  serverId: string;
  project: ModrinthProject | null;
  onClose: () => void;
}) {
  const open = !!project;
  const versions = useQuery({
    queryKey: ["server", serverId, "modpacks", "versions", project?.projectId],
    queryFn: () => api.servers.modpacks.versions(serverId, project!.projectId),
    enabled: open,
  });

  const queryClient = useQueryClient();
  const install = useMutation({
    mutationFn: (versionId: string) =>
      api.servers.modpacks.install(serverId, versionId),
    onSuccess: () => {
      toast.success("Modpack install started — watch your notifications.");
      onClose();
      // The install runs in the background; refresh once it's likely done so the
      // "installed" card and server state reflect it without a manual reload.
      queryClient.invalidateQueries({ queryKey: ["server", serverId] });
      setTimeout(
        () =>
          queryClient.invalidateQueries({
            queryKey: ["server", serverId, "modpacks", "installed"],
          }),
        8000,
      );
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Install failed"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Install {project?.title}</DialogTitle>
          <DialogDescription>
            Pick a version. The server will switch to that version&apos;s
            Minecraft release and loader.
          </DialogDescription>
        </DialogHeader>

        {versions.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : versions.data?.length ? (
          <div className="space-y-2">
            {versions.data.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{v.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    {v.gameVersions.slice(0, 3).map((g) => (
                      <Badge key={g} variant="muted" className="text-[10px]">
                        {g}
                      </Badge>
                    ))}
                    {v.loaders.map((l) => (
                      <Badge
                        key={l}
                        variant="secondary"
                        className="text-[10px] capitalize"
                      >
                        {l}
                      </Badge>
                    ))}
                    <span className="ml-1">{formatDate(v.datePublished)}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  loading={install.isPending && install.variables === v.id}
                  disabled={install.isPending}
                  onClick={() => install.mutate(v.id)}
                >
                  Install
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No installable versions found for this modpack.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
