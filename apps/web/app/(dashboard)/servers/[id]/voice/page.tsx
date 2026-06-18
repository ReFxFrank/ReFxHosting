"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Mic,
  Copy,
  KeyRound,
  Eye,
  EyeOff,
  RefreshCw,
  Users,
  Activity,
  Hash,
  Gauge,
  UserX,
  Ban,
  Pencil,
  ArrowRightLeft,
  History,
  ShieldX,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
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
import { useAuthStore } from "@/store/auth";

export default function VoicePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [revealed, setRevealed] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["server", id, "voice"],
    queryFn: () => api.servers.voice(id),
    // Poll while we wait for the server's first boot to write its credentials.
    refetchInterval: (q) => (q.state.data?.ready ? false : 5000),
  });

  // Live monitoring: active users + channels, refreshed every 15s.
  const { data: status } = useQuery({
    queryKey: ["server", id, "voice-status"],
    queryFn: () => api.servers.voiceStatus(id),
    refetchInterval: 15000,
  });

  const canManage = useAuthStore((s) => s.hasPermission("settings.update"));
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<{ clid: string; name: string } | null>(null);

  const rename = useMutation({
    mutationFn: (name: string) => api.servers.voiceRename(id, name),
    onSuccess: () => {
      toast.success("Server name updated — applies within a few seconds.");
      setNameDraft(null);
      qc.invalidateQueries({ queryKey: ["server", id, "voice-status"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't rename"),
  });
  const kick = useMutation({
    mutationFn: (t: { clid: string; label: string }) =>
      api.servers.voiceKick(id, t.clid, undefined, t.label),
    onSuccess: () => {
      toast.success("User kicked");
      qc.invalidateQueries({ queryKey: ["server", id, "voice-status"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't kick"),
  });
  const ban = useMutation({
    mutationFn: (t: { clid: string; label: string }) =>
      api.servers.voiceBan(id, t.clid, undefined, undefined, t.label),
    onSuccess: () => {
      toast.success("User banned");
      setBanTarget(null);
      qc.invalidateQueries({ queryKey: ["server", id, "voice-status"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't ban"),
  });
  const move = useMutation({
    mutationFn: (v: { clid: string; cid: string; label: string }) =>
      api.servers.voiceMove(id, v.clid, v.cid, v.label),
    onSuccess: () => {
      toast.success("User moved");
      qc.invalidateQueries({ queryKey: ["server", id, "voice-status"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't move"),
  });
  const unban = useMutation({
    mutationFn: (banid: string) => api.servers.voiceUnban(id, banid),
    onSuccess: () => {
      toast.success("Ban removed");
      qc.invalidateQueries({ queryKey: ["server", id, "voice-status"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't unban"),
  });

  // Recent admin actions (audit), shown to anyone who can view the tab.
  const { data: audit } = useQuery({
    queryKey: ["server", id, "voice-audit"],
    queryFn: () => api.servers.voiceAudit(id),
    refetchInterval: 30000,
  });

  const copy = (label: string, value?: string | null) => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Couldn't copy"),
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mic className="size-4" /> TeamSpeak voice server
          </CardTitle>
          <CardDescription>
            Connect in the TeamSpeak client using the address below. Your plan includes
            a fixed number of slots (simultaneous users), enforced automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Connection address">
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-muted px-2 py-1 font-mono text-sm">
                      {data?.address ?? "—"}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Copy address"
                      disabled={!data?.address}
                      onClick={() => copy("Address", data?.address)}
                    >
                      <Copy className="size-4" />
                    </Button>
                  </div>
                </Field>
                <Field label="Slots">
                  <Badge variant="secondary" className="gap-1">
                    <Users className="size-3" /> {data?.slots ?? "—"} clients
                  </Badge>
                </Field>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="size-4" /> Live monitoring
          </CardTitle>
          <CardDescription>
            Who&apos;s connected right now, by channel. Refreshes automatically while the
            server is running.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!status ? (
            <Skeleton className="h-24 w-full" />
          ) : !status.ready ? (
            <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-muted-foreground">
              <RefreshCw className="size-4 shrink-0 text-warning" />
              <span>
                Live stats appear here while the server is <strong>running</strong>.
                {status.updatedSecondsAgo != null &&
                  ` Last update ${status.updatedSecondsAgo}s ago.`}
              </span>
            </div>
          ) : (
            <>
              {canManage && (
                <Field label="Server name">
                  <div className="flex items-center gap-2">
                    <Input
                      value={nameDraft ?? status.serverName ?? ""}
                      onChange={(e) => setNameDraft(e.target.value)}
                      className="max-w-xs"
                    />
                    <Button
                      size="sm"
                      loading={rename.isPending}
                      disabled={
                        nameDraft === null ||
                        !nameDraft.trim() ||
                        nameDraft.trim() === (status.serverName ?? "")
                      }
                      onClick={() => rename.mutate(nameDraft!.trim())}
                    >
                      <Pencil className="size-4" /> Rename
                    </Button>
                  </div>
                </Field>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Users online">
                  <Badge variant="secondary" className="gap-1">
                    <Users className="size-3" /> {status.online}
                    {status.maxClients ? ` / ${status.maxClients}` : ""}
                  </Badge>
                </Field>
                <Field label="Channels">
                  <Badge variant="secondary" className="gap-1">
                    <Hash className="size-3" /> {status.channelCount}
                  </Badge>
                </Field>
                <Field label="Uptime">
                  <span className="text-sm">{formatUptime(status.uptimeSeconds)}</span>
                </Field>
                <Field label="Bandwidth">
                  <span className="flex items-center gap-1 text-sm">
                    <Gauge className="size-3.5 text-muted-foreground" />
                    ↓ {formatBps(status.bandwidthDownBps)} · ↑ {formatBps(status.bandwidthUpBps)}
                  </span>
                </Field>
              </div>

              <div className="space-y-2">
                {status.channels.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No channels yet.</p>
                ) : (
                  status.channels.map((ch) => (
                    <div key={ch.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{ch.name}</span>
                        <Badge variant="muted" className="gap-1 shrink-0">
                          <Users className="size-3" /> {ch.users.length}
                        </Badge>
                      </div>
                      {ch.users.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {ch.users.map((u) => (
                            <div
                              key={u.clid}
                              className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1"
                            >
                              <span className="truncate text-sm">{u.name}</span>
                              {canManage && (
                                <div className="flex shrink-0 items-center gap-1">
                                  {status.channels.length > 1 && (
                                    <Select
                                      value=""
                                      onValueChange={(cid) =>
                                        move.mutate({ clid: u.clid, cid, label: u.name })
                                      }
                                    >
                                      <SelectTrigger
                                        className="h-7 w-auto gap-1 px-2 text-xs"
                                        aria-label={`Move ${u.name}`}
                                        title="Move to channel"
                                      >
                                        <ArrowRightLeft className="size-3.5" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {status.channels
                                          .filter((c) => c.id !== ch.id)
                                          .map((c) => (
                                            <SelectItem key={c.id} value={c.id}>
                                              {c.name}
                                            </SelectItem>
                                          ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Kick ${u.name}`}
                                    title="Kick"
                                    disabled={kick.isPending}
                                    onClick={() => kick.mutate({ clid: u.clid, label: u.name })}
                                  >
                                    <UserX className="size-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Ban ${u.name}`}
                                    title="Ban"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => setBanTarget({ clid: u.clid, name: u.name })}
                                  >
                                    <Ban className="size-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {status.updatedSecondsAgo != null && (
                <p className="text-xs text-muted-foreground">
                  Updated {status.updatedSecondsAgo}s ago · refreshes every 15s
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {status?.ready && status.bans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldX className="size-4" /> Ban list
            </CardTitle>
            <CardDescription>Currently banned identities on this server.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {status.bans.map((b) => (
              <div
                key={b.banid}
                className="flex items-center justify-between gap-2 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {b.name || b.ip || `Ban #${b.banid}`}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {b.ip ? `${b.ip} · ` : ""}
                    {b.durationSeconds ? `${b.durationSeconds}s` : "permanent"}
                    {b.reason ? ` · ${b.reason}` : ""}
                  </p>
                </div>
                {canManage && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={unban.isPending}
                    onClick={() => unban.mutate(b.banid)}
                  >
                    Unban
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {audit && audit.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4" /> Recent admin actions
            </CardTitle>
            <CardDescription>
              Rename, kick, ban, move and unban actions on this voice server.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {audit.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <span className="font-medium capitalize">{a.action}</span>
                    {a.detail && (
                      <span className="text-muted-foreground"> · {a.detail}</span>
                    )}
                    <span className="block text-xs text-muted-foreground">by {a.actor}</span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(a.at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4" /> Admin access
          </CardTitle>
          <CardDescription>
            Use the <strong>privilege key</strong> to grant yourself Server Admin in the
            TeamSpeak client (Permissions → Use Privilege Key) on first join. The
            ServerQuery admin login below is for advanced remote administration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !data?.ready ? (
            <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-muted-foreground">
              <RefreshCw className="size-4 shrink-0 animate-spin text-warning" />
              <span>
                Waiting for the server&apos;s first boot to generate admin credentials.
                Make sure the server is <strong>started</strong> — this page refreshes
                automatically once they&apos;re ready.
              </span>
            </div>
          ) : (
            <>
              <Field label="Privilege key (token)">
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs">
                    {data.privilegeKey || "Already redeemed"}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Copy privilege key"
                    disabled={!data.privilegeKey}
                    onClick={() => copy("Privilege key", data.privilegeKey)}
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Single-use — once redeemed in the client it stops working (you&apos;ll
                  already have admin).
                </p>
              </Field>

              <div className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">ServerQuery admin</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRevealed((v) => !v)}
                  >
                    {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    {revealed ? "Hide" : "Reveal"}
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Login">
                    <code className="rounded bg-muted px-2 py-1 font-mono text-sm">
                      {data.queryAdmin ?? "serveradmin"}
                    </code>
                  </Field>
                  <Field label="Password">
                    <div className="flex items-center gap-1">
                      <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-sm">
                        {revealed ? data.queryPassword ?? "—" : "••••••••"}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Copy password"
                        disabled={!data.queryPassword}
                        onClick={() => copy("Password", data.queryPassword)}
                      >
                        <Copy className="size-4" />
                      </Button>
                    </div>
                  </Field>
                  <Field label="Query port">
                    <code className="rounded bg-muted px-2 py-1 font-mono text-sm">
                      {data.queryPort}
                    </code>
                  </Field>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => qc.invalidateQueries({ queryKey: ["server", id, "voice"] })}
              >
                <RefreshCw className="size-4" /> Refresh
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!banTarget} onOpenChange={(o) => !o && setBanTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ban {banTarget?.name}?</DialogTitle>
            <DialogDescription>
              This permanently bans the user from the voice server and disconnects
              them. You can remove bans later from the TeamSpeak client (Permissions
              → Ban List).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBanTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={ban.isPending}
              onClick={() =>
                banTarget && ban.mutate({ clid: banTarget.clid, label: banTarget.name })
              }
            >
              Ban user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatBps(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec < 1) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let v = bytesPerSec;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function formatUptime(seconds: number): string {
  if (!seconds || seconds < 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean);
  return parts.join(" ");
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
