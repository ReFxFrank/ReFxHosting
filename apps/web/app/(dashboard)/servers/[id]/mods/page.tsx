"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Download,
  Trash2,
  Puzzle,
  ArrowDownToLine,
  ExternalLink,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
function formatBytes(b: number) {
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${b} B`;
}

export default function ModsPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");

  const context = useQuery({
    queryKey: ["server", id, "mods", "context"],
    queryFn: () => api.servers.mods.context(id),
    retry: false,
  });

  const search = useQuery({
    queryKey: ["server", id, "mods", "search", query],
    queryFn: () => api.servers.mods.search(id, query),
    enabled: !!context.data,
  });

  const installed = useQuery({
    queryKey: ["server", id, "mods", "installed"],
    queryFn: () => api.servers.mods.installed(id),
    enabled: !!context.data,
  });

  const installMutation = useMutation({
    mutationFn: (projectId: string) => api.servers.mods.install(id, { projectId }),
    onSuccess: (res) => {
      toast.success(`Installed ${res.filename}`);
      queryClient.invalidateQueries({ queryKey: ["server", id, "mods", "installed"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Install failed"),
  });

  const removeMutation = useMutation({
    mutationFn: (filename: string) => api.servers.mods.remove(id, filename),
    onSuccess: () => {
      toast.success("Removed");
      queryClient.invalidateQueries({ queryKey: ["server", id, "mods", "installed"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Remove failed"),
  });

  const kind = context.data?.kind ?? "mod";
  const kindPlural = kind === "plugin" ? "plugins" : "mods";

  // Non-Minecraft / Vanilla → friendly notice.
  if (context.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mods" description="Browse and install content from Modrinth." />
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {context.error instanceof ApiError
              ? context.error.message
              : "Mods aren't available for this server."}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={kind === "plugin" ? "Plugins" : "Mods"}
        description={
          context.data
            ? `Browse Modrinth for ${context.data.loader} ${kindPlural} compatible with Minecraft ${context.data.gameVersion}. Installed into /${context.data.directory}.`
            : "Browse and install content from Modrinth."
        }
      />

      {/* Installed */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Puzzle className="size-4 text-primary" /> Installed{" "}
            {installed.data ? (
              <Badge variant="muted">{installed.data.files.length}</Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {installed.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : installed.data?.files.length ? (
            installed.data.files.map((f) => (
              <div
                key={f.name}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm">{f.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(f.size)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:text-destructive"
                  loading={removeMutation.isPending && removeMutation.variables === f.name}
                  onClick={() => removeMutation.mutate(f.name)}
                  aria-label={`Remove ${f.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing installed yet — find something below.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Search */}
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
            placeholder={`Search Modrinth ${kindPlural}…`}
            className="pl-9"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {/* Results */}
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
                      <ArrowDownToLine className="size-3" /> {formatCount(p.downloads)}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      size="sm"
                      loading={
                        installMutation.isPending &&
                        installMutation.variables === p.projectId
                      }
                      onClick={() => installMutation.mutate(p.projectId)}
                    >
                      <Download className="size-4" /> Install
                    </Button>
                    <a
                      href={`https://modrinth.com/${kind}/${p.slug}`}
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
            No results. Try a different search.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
