"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  ExternalLink,
  Layers,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { EmptyState } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import type { WorkshopMod } from "@/lib/types";

export default function WorkshopPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [input, setInput] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["server", id, "workshop"],
    queryFn: () => api.servers.workshop(id),
  });
  const mods = data ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ["server", id, "workshop"] });

  const add = useMutation({
    mutationFn: () => api.servers.workshopAdd(id, input.trim()),
    onSuccess: () => {
      setInput("");
      toast.success("Added");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't add that item"),
  });

  const toggle = useMutation({
    mutationFn: (m: WorkshopMod) => api.servers.workshopToggle(id, m.id, !m.enabled),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to update"),
  });

  const remove = useMutation({
    mutationFn: (modId: string) => api.servers.workshopRemove(id, modId),
    onSuccess: () => { toast.success("Removed"); invalidate(); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to remove"),
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.servers.workshopReorder(id, ids),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to reorder"),
  });

  const apply = useMutation({
    mutationFn: () => api.servers.workshopApply(id),
    onSuccess: () => {
      toast.success("Applying — the server is reinstalling to fetch your Workshop content.");
      qc.invalidateQueries({ queryKey: ["server", id] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to apply"),
  });

  function move(index: number, dir: -1 | 1) {
    const next = [...mods];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    reorder.mutate(next.map((m) => m.id));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Boxes className="size-4" /> Steam Workshop
            </CardTitle>
            <CardDescription>
              Add Workshop items or a collection by ID or URL, then Apply to install them.
            </CardDescription>
          </div>
          <Button
            size="sm"
            loading={apply.isPending}
            disabled={mods.length === 0}
            onClick={() => apply.mutate()}
          >
            <RefreshCw className="size-4" /> Apply &amp; reinstall
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Workshop ID or https://steamcommunity.com/sharedfiles/filedetails/?id=…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && input.trim() && add.mutate()}
            />
            <Button loading={add.isPending} disabled={!input.trim()} onClick={() => add.mutate()}>
              <Plus className="size-4" /> Add
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : mods.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="No Workshop content yet"
              description="Add an item or collection above. Collections load all their items; some games require a central Steam login (Admin → Settings → Steam)."
            />
          ) : (
            <div className="space-y-2">
              {mods.map((m, i) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-lg border p-2.5"
                  data-state={m.enabled ? undefined : "muted"}
                >
                  <div className="flex flex-col">
                    <button
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      disabled={i === 0 || reorder.isPending}
                      onClick={() => move(i, -1)}
                      aria-label="Move up"
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      disabled={i === mods.length - 1 || reorder.isPending}
                      onClick={() => move(i, 1)}
                      aria-label="Move down"
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cnTrunc(!m.enabled)}>{m.name || `Item ${m.workshopId}`}</span>
                      {m.kind === "COLLECTION" && (
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <Layers className="size-3" /> Collection
                        </Badge>
                      )}
                    </div>
                    <a
                      href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${m.workshopId}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                    >
                      {m.workshopId} <ExternalLink className="size-3" />
                    </a>
                  </div>
                  <Switch
                    checked={m.enabled}
                    disabled={toggle.isPending}
                    onCheckedChange={() => toggle.mutate(m)}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(m.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Changes take effect after <strong>Apply &amp; reinstall</strong> (data is preserved).
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function cnTrunc(muted: boolean) {
  return `truncate font-medium${muted ? " text-muted-foreground line-through" : ""}`;
}
