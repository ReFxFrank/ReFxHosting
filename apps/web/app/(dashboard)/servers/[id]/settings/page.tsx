"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Settings2,
  Terminal,
  Server as ServerIcon,
  Users,
  TriangleAlert,
  Copy,
  Check,
  KeyRound,
  Plus,
  Trash2,
  Pencil,
  ShieldAlert,
  DownloadCloud,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { cn, copyToClipboard, formatMoney } from "@/lib/utils";
import type { Server, SubUser } from "@/lib/types";
import {
  PERMISSION_GROUPS,
  ALL_GRANTABLE_KEYS,
  hasServerPermission,
} from "@/lib/server-permissions";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      if (!(await copyToClipboard(value))) throw new Error("copy failed");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={copy}
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
    </Button>
  );
}

export default function ServerSettingsPage() {
  const { id } = useParams<{ id: string }>();

  const { data: server, isLoading } = useQuery({
    queryKey: ["server", id],
    queryFn: () => api.servers.get(id),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your server configuration, access and lifecycle."
      />

      {isLoading || !server ? (
        <Skeleton className="h-[28rem] w-full" />
      ) : (
        <Tabs defaultValue="general">
          <TabsList className="flex w-full flex-wrap justify-start sm:w-auto">
            <TabsTrigger value="general">
              <Settings2 /> General
            </TabsTrigger>
            <TabsTrigger value="startup">
              <Terminal /> Startup
            </TabsTrigger>
            <TabsTrigger value="sftp">
              <ServerIcon /> SFTP
            </TabsTrigger>
            <TabsTrigger value="subusers">
              <Users /> Sub-users
            </TabsTrigger>
            <TabsTrigger value="danger">
              <TriangleAlert /> Danger zone
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <div className="space-y-6">
              <GeneralTab server={server} />
              <UpdateGameCard server={server} />
              <AutoRestartCard server={server} />
              <VanityAddressCard server={server} />
            </div>
          </TabsContent>
          <TabsContent value="startup">
            <StartupTab server={server} />
          </TabsContent>
          <TabsContent value="sftp">
            <SftpTab id={id} />
          </TabsContent>
          <TabsContent value="subusers">
            <SubUsersTab id={id} />
          </TabsContent>
          <TabsContent value="danger">
            <DangerTab id={id} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// General
// ---------------------------------------------------------------------------
function GeneralTab({ server }: { server: Server }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(server.name);
  const [description, setDescription] = useState(server.description ?? "");

  const renameMutation = useMutation({
    mutationFn: () => api.servers.rename(server.id, name, description),
    onSuccess: () => {
      toast.success("Server details saved");
      queryClient.invalidateQueries({ queryKey: ["server", server.id] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to save details"),
  });

  const dirty =
    name !== server.name || description !== (server.description ?? "");

  return (
    <Card>
      <CardHeader>
        <CardTitle>General</CardTitle>
        <CardDescription>
          Display name and description for your server.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="srv-name">Name</Label>
          <Input
            id="srv-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="srv-desc">Description</Label>
          <Textarea
            id="srv-desc"
            placeholder="A short description for your reference"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <Button
            loading={renameMutation.isPending}
            disabled={!dirty || !name.trim()}
            onClick={() => renameMutation.mutate()}
          >
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Update game — reinstall latest build with data preserved
// ---------------------------------------------------------------------------
function UpdateGameCard({ server }: { server: Server }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const canUpdate = hasServerPermission(
    server.viewerPermissions,
    "control.reinstall",
  );
  const gameName = server.template?.name ?? "game";

  const updateMutation = useMutation({
    mutationFn: () => api.servers.update(server.id),
    onSuccess: () => {
      toast.success(`Updating ${gameName} — pulling the latest build`);
      setConfirmOpen(false);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to start update"),
  });

  // Hide for members without reinstall rights (the server enforces it too).
  if (!canUpdate) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DownloadCloud className="size-5" /> Update game
        </CardTitle>
        <CardDescription>
          Pull the latest {gameName} server build. Your world, config and backups
          are kept — the server reinstalls the current build in place and
          restarts on it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Update to the latest build</p>
            <p className="text-xs text-muted-foreground">
              Safe to run anytime. Best done while the server is stopped so the
              newest save is already on disk.
            </p>
          </div>
          <Button onClick={() => setConfirmOpen(true)}>
            <DownloadCloud className="size-4" /> Update now
          </Button>
        </div>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update {gameName}?</DialogTitle>
            <DialogDescription>
              This reinstalls the latest server build with your data preserved —
              world saves, config and backups are kept. The server goes offline
              briefly while it updates, then you can start it again.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            Tip: stop the server first so its newest save is flushed to disk. For
            an extra safety net, create a backup from the Backups tab before
            updating.
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={updateMutation.isPending}
              onClick={() => updateMutation.mutate()}
            >
              <DownloadCloud className="size-4" /> Update now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Crash auto-restart
// ---------------------------------------------------------------------------
function AutoRestartCard({ server }: { server: Server }) {
  const queryClient = useQueryClient();
  // Absence of the flag means ON — matches the node agent's default.
  const enabled = server.environment?.REFX_AUTO_RESTART !== "false";
  const canToggle = hasServerPermission(
    server.viewerPermissions,
    "settings.update",
  );

  const toggle = useMutation({
    mutationFn: (next: boolean) => api.servers.setAutoRestart(server.id, next),
    onSuccess: ({ enabled: next }) => {
      toast.success(
        next ? "Crash auto-restart enabled" : "Crash auto-restart disabled",
      );
      queryClient.invalidateQueries({ queryKey: ["server", server.id] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Failed to update auto-restart",
      ),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crash auto-restart</CardTitle>
        <CardDescription>
          Bring the server back automatically if it crashes. To avoid a crash
          loop, we stop after 3 restarts within 10 minutes — after that the
          server stays stopped until you start it yourself.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">
              Restart automatically after a crash
            </p>
            <p className="text-muted-foreground text-sm">
              {enabled
                ? "On — crashed servers restart after a few seconds."
                : "Off — crashed servers stay stopped until started manually."}
            </p>
          </div>
          <Switch
            checked={enabled}
            disabled={!canToggle || toggle.isPending}
            onCheckedChange={(next) => toggle.mutate(next)}
            aria-label="Toggle crash auto-restart"
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Custom server address (paid vanity label)
// ---------------------------------------------------------------------------

/** Client-side preview of the label rules; the server is authoritative. */
const VANITY_LABEL_RE = /^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])?$/;

function VanityAddressCard({ server }: { server: Server }) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [removeOpen, setRemoveOpen] = useState(false);

  const isOwner = hasServerPermission(server.viewerPermissions, "settings.update");
  const { data: status } = useQuery({
    queryKey: ["server-vanity", server.id],
    queryFn: () => api.servers.vanityStatus(server.id),
    retry: false,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["server-vanity", server.id] });
    queryClient.invalidateQueries({ queryKey: ["server", server.id] });
  };

  const payInvoice = async (invoiceId: string) => {
    const res = await api.billing.payInvoice(invoiceId);
    if (res?.checkoutUrl) {
      window.location.href = res.checkoutUrl;
      return;
    }
    toast.success("Payment received — your new address is active");
    invalidate();
  };

  const purchase = useMutation({
    mutationFn: () => api.servers.purchaseVanity(server.id, label.trim()),
    onSuccess: async (res) => {
      if (res.status === "applied") {
        toast.success(`Your server address is now ${res.address}`);
        setLabel("");
        invalidate();
        return;
      }
      // Invoiced — take them straight into payment (credit/saved card settles
      // instantly; otherwise we redirect to checkout).
      try {
        await payInvoice(res.invoiceId);
      } catch (e) {
        toast.error(
          e instanceof ApiError
            ? e.message
            : "Invoice created — pay it from Billing to activate your address",
        );
        invalidate();
      }
      setLabel("");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Purchase failed"),
  });

  const removeMutation = useMutation({
    mutationFn: () => api.servers.removeVanity(server.id),
    onSuccess: () => {
      toast.success("Custom address removed");
      setRemoveOpen(false);
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to remove"),
  });

  // Hidden entirely when the feature/location doesn't support it.
  if (!status?.enabled) return null;

  const normalized = label.trim().toLowerCase();
  const valid = VANITY_LABEL_RE.test(normalized);
  const preview = normalized ? `${normalized}.${status.gameDomain}` : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custom server address</CardTitle>
        <CardDescription>
          Replace the random address with a name of your choice — one-time{" "}
          {formatMoney(status.feeMinor, status.currency)} per name.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.currentLabel && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-success/40 bg-success/5 p-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">
                {status.currentAddress ?? status.currentLabel}
              </p>
              <p className="text-xs text-muted-foreground">
                Your custom address is active.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {status.currentAddress && (
                <CopyButton value={status.currentAddress} label="address" />
              )}
              {isOwner && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setRemoveOpen(true)}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        )}

        {status.pending && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{status.pending.address}</p>
              <p className="text-xs text-muted-foreground">
                Awaiting payment (
                {formatMoney(status.pending.amountMinor, status.pending.currency)}
                ) — your address activates once paid.
              </p>
            </div>
            {isOwner && (
              <div className="flex items-center gap-2">
                {status.pending.invoiceId && (
                  <Button
                    size="sm"
                    onClick={() => void payInvoice(status.pending!.invoiceId!)}
                  >
                    Pay now
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  loading={removeMutation.isPending}
                  onClick={() => removeMutation.mutate()}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}

        {isOwner && !status.pending && (
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <Label htmlFor="vanity-label">
              {status.currentLabel ? "Change your address" : "Pick your address"}
            </Label>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <div className="flex items-center gap-1.5">
                <Input
                  id="vanity-label"
                  placeholder="whatever"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="font-mono"
                />
                <span className="shrink-0 text-sm text-muted-foreground">
                  .{status.gameDomain}
                </span>
              </div>
              <Button
                loading={purchase.isPending}
                disabled={!valid}
                onClick={() => purchase.mutate()}
              >
                Buy for {formatMoney(status.feeMinor, status.currency)}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {normalized && !valid
                ? "3-32 characters: lowercase letters, numbers and hyphens (not at the start or end)."
                : preview
                  ? `Your server will be reachable at ${preview} (same port).`
                  : "3-32 characters: lowercase letters, numbers and hyphens. Each name change is a new purchase."}
            </p>
          </div>
        )}
      </CardContent>

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove custom address?</DialogTitle>
            <DialogDescription>
              Your server goes back to its default address. The name becomes
              available for anyone to buy, and no refund is issued.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoveOpen(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              loading={removeMutation.isPending}
              onClick={() => removeMutation.mutate()}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Startup + variables
// ---------------------------------------------------------------------------
function StartupTab({ server }: { server: Server }) {
  const queryClient = useQueryClient();
  const [startupCommand, setStartupCommand] = useState(
    server.startupCommand ?? "",
  );
  const [dockerImage, setDockerImage] = useState(server.dockerImage ?? "");

  const startupMutation = useMutation({
    mutationFn: () =>
      api.servers.updateStartup(server.id, { startupCommand, dockerImage }),
    onSuccess: () => {
      toast.success("Startup configuration saved");
      queryClient.invalidateQueries({ queryKey: ["server", server.id] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to save startup"),
  });

  const startupDirty =
    startupCommand !== (server.startupCommand ?? "") ||
    dockerImage !== (server.dockerImage ?? "");

  return (
    <div className="space-y-6">
      {/* Minecraft loader/version lives in its own server tab (Minecraft). */}
      <Card>
        <CardHeader>
          <CardTitle>Startup</CardTitle>
          <CardDescription>
            The command and container image used to launch your server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="startup-cmd">Startup command</Label>
            <Textarea
              id="startup-cmd"
              className="font-mono text-xs"
              value={startupCommand}
              onChange={(e) => setStartupCommand(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="docker-image">Docker image</Label>
            <Input
              id="docker-image"
              className="font-mono text-xs"
              placeholder="ghcr.io/refx/runtime:latest"
              value={dockerImage}
              onChange={(e) => setDockerImage(e.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button
              loading={startupMutation.isPending}
              disabled={!startupDirty}
              onClick={() => startupMutation.mutate()}
            >
              Save startup
            </Button>
          </div>
        </CardContent>
      </Card>

      <VariablesCard id={server.id} />

      {/* Minecraft-only features — only surface them there. */}
      {server.template?.slug?.startsWith("minecraft") && (
        <>
          <JavaVersionCard id={server.id} />
          <VoiceChatCard id={server.id} />
        </>
      )}
    </div>
  );
}

/**
 * Java version selector: force a specific JVM (Temurin) major for the instance,
 * or leave it on Auto (picked from the Minecraft version). Handy for legacy
 * Forge packs that need Java 8, or to pin a newer JVM. Applies on next restart.
 */
function JavaVersionCard({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["server-java-version", id],
    queryFn: () => api.servers.getJavaVersion(id),
  });

  const setVersion = useMutation({
    mutationFn: (version: string) => api.servers.setJavaVersion(id, version),
    onSuccess: (state) => {
      qc.setQueryData(["server-java-version", id], state);
      toast.success(
        state.selected === "auto"
          ? `Java set to Auto (currently Java ${state.effective})`
          : `Java pinned to ${state.selected}`,
      );
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to set Java version"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Java version</CardTitle>
        <CardDescription>
          Choose which Java runtime this server uses. Leave it on{" "}
          <span className="font-medium">Auto</span> to match your Minecraft
          version, or pin one — e.g. Java 8 for legacy Forge packs (1.7.10 /
          1.12.2). Takes effect on the next restart.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <select
                aria-label="Java version"
                value={data.selected}
                disabled={setVersion.isPending}
                onChange={(e) => setVersion.mutate(e.target.value)}
                className={cn(
                  "h-9 rounded-md border border-input bg-background px-3 text-sm",
                  "focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50",
                )}
              >
                <option value="auto">Auto (Java {data.auto})</option>
                {data.options.map((major) => (
                  <option key={major} value={String(major)}>
                    Java {major}
                  </option>
                ))}
              </select>
              <Badge variant="muted">Running: Java {data.effective}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Picking a JVM your Minecraft version doesn&apos;t support can stop
              the server from starting. When unsure, use Auto.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Simple Voice Chat self-serve: reserve a dedicated UDP port so proximity voice
 * doesn't collide with the game/query port. Publishes on the next restart.
 */
function VoiceChatCard({ id }: { id: string }) {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["server-voice-chat", id],
    queryFn: () => api.servers.voiceChatStatus(id),
  });
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["server-voice-chat", id] });

  const enable = useMutation({
    mutationFn: () => api.servers.enableVoiceChat(id),
    onSuccess: (r) => {
      toast.success(`Voice port ${r.port} reserved`);
      refresh();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to enable"),
  });
  const disable = useMutation({
    mutationFn: () => api.servers.disableVoiceChat(id),
    onSuccess: () => {
      toast.success("Voice port removed");
      refresh();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to disable"),
  });

  const port = status.data?.port;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Simple Voice Chat</CardTitle>
        <CardDescription>
          Proximity voice for Minecraft needs its own UDP port. Enable it to
          reserve a dedicated port so voice doesn&apos;t clash with your game or
          query port.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.isLoading ? (
          <p className="text-sm text-muted-foreground">Checking…</p>
        ) : status.data?.enabled ? (
          <>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2 text-sm">
              Enabled on port{" "}
              <span className="font-mono font-semibold">{port}</span>.
            </div>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>
                In <span className="font-mono">Files</span>, open{" "}
                <span className="font-mono">
                  voicechat/voicechat-server.properties
                </span>{" "}
                (Paper: <span className="font-mono">plugins/voicechat/…</span>)
                and set{" "}
                <span className="font-mono text-foreground">port={port}</span>{" "}
                and <span className="font-mono">bind_address=0.0.0.0</span>.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Restart the server
                </span>{" "}
                so the new port is published.
              </li>
            </ol>
            <div className="flex justify-end">
              <Button
                variant="outline"
                loading={disable.isPending}
                onClick={() => disable.mutate()}
              >
                Disable
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Not enabled. We&apos;ll reserve a free UDP port for voice chat.
            </p>
            <Button loading={enable.isPending} onClick={() => enable.mutate()}>
              Enable voice chat
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VariablesCard({ id }: { id: string }) {
  const { data: variables, isLoading } = useQuery({
    queryKey: ["server-variables", id],
    queryFn: () => api.servers.variables(id),
  });

  const [values, setValues] = useState<Record<string, string>>({});

  // LOADER / MINECRAFT_VERSION / LOADER_VERSION are managed by the dedicated
  // Minecraft card above (it resolves + reinstalls), so don't surface them as
  // raw, no-op variables here.
  const HIDDEN = ["MINECRAFT_VERSION", "LOADER", "LOADER_VERSION"];
  const shownVariables = variables?.filter((v) => !HIDDEN.includes(v.envName));

  useEffect(() => {
    if (variables) {
      // Seed inputs with current values; write-only secrets stay empty (their
      // value isn't sent to the browser) and show a "saved" placeholder instead.
      setValues(
        Object.fromEntries(
          variables
            .filter((v) => !HIDDEN.includes(v.envName))
            .map((v) => [v.envName, v.value]),
        ),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variables]);

  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["server-variables", id] });

  const saveMutation = useMutation({
    mutationFn: (envName: string) =>
      api.servers.setVariable(id, envName, values[envName] ?? ""),
    onSuccess: () => {
      toast.success("Variable saved");
      invalidate();
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Failed to save variable",
      ),
  });

  // Add a custom env var (e.g. a bot's CLIENT_ID, a DATABASE_URL) not defined by
  // the egg. Reuses the same set-variable endpoint.
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const addMutation = useMutation({
    mutationFn: () =>
      api.servers.setVariable(id, newName.trim().toUpperCase(), newValue),
    onSuccess: () => {
      toast.success("Variable added");
      setAdding(false);
      setNewName("");
      setNewValue("");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to add variable"),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Server variables</CardTitle>
          <CardDescription>
            Environment values passed to your server on boot.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAdding((a) => !a)}
        >
          <Plus className="size-4" /> Add variable
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {adding && (
          <div className="grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-[12rem_1fr_auto] sm:items-center">
            <Input
              placeholder="ENV_NAME"
              className="font-mono text-xs uppercase"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Input
              placeholder="value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            />
            <Button
              size="sm"
              disabled={!newName.trim()}
              loading={addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              Add
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : shownVariables?.length ? (
          shownVariables.map((v) => {
            const isSecret = v.type === "SECRET" || !v.userViewable;
            const dirty =
              (values[v.envName] ?? "") !== (isSecret ? "" : v.value);
            const required =
              (v.rules?.required as boolean | undefined) ?? false;
            return (
              <div key={v.envName} className="space-y-1.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <Label className="text-sm">
                    {v.displayName || v.envName}
                  </Label>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {v.envName}
                  </span>
                  {required && (
                    <span className="text-xs text-destructive">required</span>
                  )}
                  {!v.userEditable && (
                    <span className="text-xs text-muted-foreground">
                      read-only
                    </span>
                  )}
                </div>
                {v.description && (
                  <p className="text-xs text-muted-foreground">
                    {v.description}
                  </p>
                )}
                <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                  <Input
                    type={isSecret ? "password" : "text"}
                    autoComplete={isSecret ? "new-password" : "off"}
                    disabled={!v.userEditable}
                    placeholder={
                      isSecret && v.isSet
                        ? "•••••••• (saved — enter to replace)"
                        : undefined
                    }
                    value={values[v.envName] ?? ""}
                    onChange={(e) =>
                      setValues((s) => ({ ...s, [v.envName]: e.target.value }))
                    }
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!v.userEditable || !dirty}
                    loading={
                      saveMutation.isPending &&
                      saveMutation.variables === v.envName
                    }
                    onClick={() => saveMutation.mutate(v.envName)}
                  >
                    Save
                  </Button>
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-muted-foreground">
            This server has no editable variables.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SFTP
// ---------------------------------------------------------------------------
function SftpTab({ id }: { id: string }) {
  const { data: sftp, isLoading } = useQuery({
    queryKey: ["server-sftp", id],
    queryFn: () => api.servers.sftp(id),
  });

  const [revealed, setRevealed] = useState<string | null>(null);
  const [pwCopied, setPwCopied] = useState(false);

  const rotateMutation = useMutation({
    mutationFn: () => api.servers.rotateSftp(id),
    onSuccess: (res) => {
      toast.success("SFTP password rotated");
      setRevealed(res.password);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Failed to rotate password",
      ),
  });

  const copyPw = async () => {
    if (!revealed) return;
    try {
      if (!(await copyToClipboard(revealed))) throw new Error("copy failed");
      setPwCopied(true);
      setTimeout(() => setPwCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>SFTP access</CardTitle>
        <CardDescription>
          Connect with any SFTP client using the details below. Click “Rotate
          password” to generate your SFTP password (shown once).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !sftp ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : (
          <>
            {/* This is an SFTP (SSH) endpoint, not FTP. FileZilla's Quickconnect
                bar defaults to plain FTP and fails with "Cannot establish FTP
                connection to an SFTP server" — so lead with the protocol and a
                paste-ready sftp:// string that forces the right protocol. */}
            <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              <ServerIcon className="mt-0.5 size-4 shrink-0 text-foreground" />
              <span>
                This is an <span className="font-medium text-foreground">SFTP (SSH)</span>{" "}
                connection on port{" "}
                <span className="font-mono text-foreground">{sftp.port}</span> —
                not FTP. In your client pick{" "}
                <span className="font-medium text-foreground">
                  “SFTP - SSH File Transfer Protocol”
                </span>
                , or paste the connection string below into FileZilla’s
                Quickconnect bar (the <span className="font-mono">sftp://</span>{" "}
                prefix selects the protocol for you). Plain FTP will not work.
              </span>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Connection string
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={`sftp://${sftp.username}@${sftp.host}:${sftp.port}`}
                  className="font-mono"
                />
                <CopyButton
                  value={`sftp://${sftp.username}@${sftp.host}:${sftp.port}`}
                  label="connection string"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Protocol</Label>
              <Input
                readOnly
                value="SFTP - SSH File Transfer Protocol"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Host</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={sftp.host} className="font-mono" />
                <CopyButton value={sftp.host} label="host" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Port</Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={String(sftp.port)}
                  className="font-mono"
                />
                <CopyButton value={String(sftp.port)} label="port" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Username</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={sftp.username} className="font-mono" />
                <CopyButton value={sftp.username} label="username" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline"
                loading={rotateMutation.isPending}
                onClick={() => rotateMutation.mutate()}
              >
                <KeyRound className="size-4" /> Rotate password
              </Button>
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={!!revealed} onOpenChange={(o) => !o && setRevealed(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New SFTP password</DialogTitle>
            <DialogDescription>
              Copy this password now. For security it will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={revealed ?? ""} className="font-mono" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={copyPw}
              aria-label="Copy password"
            >
              {pwCopied ? <Check className="text-success" /> : <Copy />}
            </Button>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>This is the only time the password is displayed.</span>
          </div>
          <DialogFooter>
            <Button onClick={() => setRevealed(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-users
// ---------------------------------------------------------------------------
function SubUsersTab({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const { data: subUsers, isLoading } = useQuery({
    queryKey: ["server-subusers", id],
    queryFn: () => api.servers.subUsers(id),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["server-subusers", id] });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [perms, setPerms] = useState<string[]>([]);
  const [editing, setEditing] = useState<SubUser | null>(null);
  const [removeTarget, setRemoveTarget] = useState<SubUser | null>(null);

  const togglePerm = (perm: string) =>
    setPerms((p) =>
      p.includes(perm) ? p.filter((x) => x !== perm) : [...p, perm],
    );

  const setGroup = (keys: string[], on: boolean) =>
    setPerms((p) => {
      const without = p.filter((x) => !keys.includes(x));
      return on ? [...without, ...keys] : without;
    });

  const allSelected = ALL_GRANTABLE_KEYS.every((k) => perms.includes(k));
  const setAll = (on: boolean) => setPerms(on ? [...ALL_GRANTABLE_KEYS] : []);

  const inviteMutation = useMutation({
    mutationFn: () => api.servers.addSubUser(id, { email, permissions: perms }),
    onSuccess: () => {
      toast.success("Invitation sent");
      invalidate();
      setInviteOpen(false);
      setEmail("");
      setPerms([]);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Failed to invite sub-user",
      ),
  });

  const updateMutation = useMutation({
    mutationFn: () => api.servers.updateSubUser(id, editing!.id, perms),
    onSuccess: () => {
      toast.success("Permissions updated");
      invalidate();
      setEditing(null);
      setPerms([]);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Failed to update permissions",
      ),
  });

  const removeMutation = useMutation({
    mutationFn: (subId: string) => api.servers.removeSubUser(id, subId),
    onSuccess: () => {
      toast.success("Sub-user removed");
      invalidate();
      setRemoveTarget(null);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Failed to remove sub-user",
      ),
  });

  const openEdit = (su: SubUser) => {
    setEditing(su);
    setPerms(su.permissions);
  };

  const PermissionEditor = (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Full access</p>
          <p className="text-xs text-muted-foreground">
            Grant everything — equivalent to a co-owner.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[hsl(var(--primary))]"
            checked={allSelected}
            onChange={(e) => setAll(e.target.checked)}
          />
          Select all
        </label>
      </div>

      <div className="max-h-[45vh] space-y-4 overflow-y-auto pr-1">
        {PERMISSION_GROUPS.map(({ group, hint, permissions }) => {
          const keys = permissions.map((p) => p.key);
          const groupAll = keys.every((k) => perms.includes(k));
          return (
            <div key={group} className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{group}</p>
                  <p className="text-xs text-muted-foreground">{hint}</p>
                </div>
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => setGroup(keys, !groupAll)}
                >
                  {groupAll ? "Clear" : "Select all"}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {permissions.map((perm) => (
                  <label
                    key={perm.key}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm transition-colors",
                      perms.includes(perm.key) && "border-primary bg-primary/5",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 accent-[hsl(var(--primary))]"
                      checked={perms.includes(perm.key)}
                      onChange={() => togglePerm(perm.key)}
                    />
                    <span className="space-y-0.5">
                      <span className="block font-medium leading-tight">
                        {perm.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {perm.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Sub-users</CardTitle>
          <CardDescription>
            Grant scoped access to other people.
          </CardDescription>
        </div>
        <Button
          onClick={() => {
            setEmail("");
            setPerms([]);
            setInviteOpen(true);
          }}
        >
          <Plus className="size-4" /> Invite
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : subUsers?.length ? (
          subUsers.map((su) => (
            <div
              key={su.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{su.email}</p>
                <p className="text-xs text-muted-foreground">
                  {su.permissions.length} permission
                  {su.permissions.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={su.state === "ACTIVE" ? "success" : "muted"}>
                  {su.state === "ACTIVE" ? "Active" : "Revoked"}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEdit(su)}
                >
                  <Pencil className="size-4" /> Edit
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setRemoveTarget(su)}
                  aria-label="Remove sub-user"
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            No sub-users yet. Invite someone to collaborate.
          </p>
        )}
      </CardContent>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Invite sub-user</DialogTitle>
            <DialogDescription>
              They&apos;ll get access scoped to the permissions you select.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="teammate@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Permissions</Label>
              {PermissionEditor}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={inviteMutation.isPending}
              disabled={!email.trim() || perms.length === 0}
              onClick={() => inviteMutation.mutate()}
            >
              Send invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit permissions</DialogTitle>
            <DialogDescription>{editing?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Permissions</Label>
            {PermissionEditor}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              loading={updateMutation.isPending}
              onClick={() => updateMutation.mutate()}
            >
              Save permissions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirm */}
      <Dialog
        open={!!removeTarget}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove sub-user</DialogTitle>
            <DialogDescription>
              Revoke access for{" "}
              <span className="font-medium">{removeTarget?.email}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={removeMutation.isPending}
              onClick={() =>
                removeTarget && removeMutation.mutate(removeTarget.id)
              }
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Danger zone
// ---------------------------------------------------------------------------
function DangerTab({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const reinstallMutation = useMutation({
    mutationFn: () => api.servers.reinstall(id),
    onSuccess: () => {
      toast.success("Reinstall started");
      queryClient.invalidateQueries({ queryKey: ["server", id] });
      setConfirmOpen(false);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Failed to start reinstall",
      ),
  });

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
        <CardDescription>Irreversible and destructive actions.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Reinstall server</p>
            <p className="text-xs text-muted-foreground">
              Re-runs the game install script. Files may be overwritten.
            </p>
          </div>
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
            Reinstall
          </Button>
        </div>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reinstall server</DialogTitle>
            <DialogDescription>
              This reinstalls the game and may overwrite existing files. The
              server will be offline during the process. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>
              Create a backup first if you need to preserve any current data.
            </span>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={reinstallMutation.isPending}
              onClick={() => reinstallMutation.mutate()}
            >
              Reinstall now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
