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
  KeyRound,
  ShieldAlert,
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
  const [guardCode, setGuardCode] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["server", id, "workshop"],
    queryFn: () => api.servers.workshop(id),
  });
  const mods = data ?? [];
  // Shared cache with SteamLoginCard — tells us whether to offer a Guard code.
  const { data: steam } = useQuery({
    queryKey: ["server", id, "workshop-steam"],
    queryFn: () => api.servers.workshopSteam(id),
  });
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
    mutationFn: () => api.servers.workshopApply(id, guardCode.trim() || undefined),
    onSuccess: () => {
      toast.success("Applying — the server is reinstalling to fetch your Workshop content.");
      setGuardCode("");
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
      <SteamLoginCard serverId={id} />

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
          <div className="flex flex-col items-end gap-2">
            {steam?.hasLogin && (
              <Input
                value={guardCode}
                onChange={(e) => setGuardCode(e.target.value)}
                placeholder="Steam Guard code (if asked)"
                className="h-8 w-44 text-sm"
                aria-label="Steam Guard code"
              />
            )}
            <Button
              size="sm"
              loading={apply.isPending}
              disabled={mods.length === 0}
              onClick={() => apply.mutate()}
            >
              <RefreshCw className="size-4" /> Apply &amp; reinstall
            </Button>
          </div>
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

/** The customer's OWN Steam login for this server's Workshop downloads. */
function SteamLoginCard({ serverId }: { serverId: string }) {
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["server", serverId, "workshop-steam"],
    queryFn: () => api.servers.workshopSteam(serverId),
  });
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["server", serverId, "workshop-steam"] });

  const save = useMutation({
    mutationFn: () => api.servers.workshopSetSteam(serverId, username.trim(), password),
    onSuccess: () => {
      toast.success("Steam login saved — it's used on the next Apply/reinstall.");
      setUsername("");
      setPassword("");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to save"),
  });

  const clear = useMutation({
    mutationFn: () => api.servers.workshopClearSteam(serverId),
    onSuccess: () => { toast.success("Steam login removed"); invalidate(); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to remove"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4" /> Your Steam account
        </CardTitle>
        <CardDescription>
          Many Workshop items (e.g. Arma 3) can only be downloaded by a Steam account
          that <strong>owns the game</strong>. Use your own — the password is encrypted
          and only used on the node to fetch your mods; it&apos;s never shown again.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm">
              <Badge variant={data?.hasLogin ? "success" : "secondary"}>
                {data?.hasLogin ? `Connected as ${data.username}` : "Not connected"}
              </Badge>
              {data?.hasLogin && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  loading={clear.isPending}
                  onClick={() => clear.mutate()}
                >
                  Disconnect
                </Button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                autoComplete="off"
                placeholder="Steam username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <Input
                type="password"
                autoComplete="new-password"
                placeholder={data?.hasLogin ? "New password (to update)" : "Steam password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>
                Using <strong>Steam Guard</strong>? Enter your current code in the
                <strong> Steam Guard code</strong> box next to <strong>Apply</strong> — it&apos;s
                passed to Steam for that download and this machine is then remembered, so
                you usually only need it once. <strong>Email</strong> codes work best;
                mobile-authenticator codes can expire before the install runs. We never
                share your password.
              </span>
            </div>
            <div className="flex justify-end">
              <Button
                loading={save.isPending}
                disabled={!username.trim() || !password}
                onClick={() => save.mutate()}
              >
                Save Steam login
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
