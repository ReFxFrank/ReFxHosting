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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { cn } from "@/lib/utils";
import type { Server, SubUser } from "@/lib/types";

const PERMISSIONS = [
  "console.read",
  "console.command",
  "files.read",
  "files.write",
  "backup.create",
  "backup.restore",
  "database.read",
  "settings.update",
] as const;

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };
  return (
    <Button type="button" variant="outline" size="icon" onClick={copy} aria-label={`Copy ${label}`}>
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
            <GeneralTab server={server} />
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

  const dirty = name !== server.name || description !== (server.description ?? "");

  return (
    <Card>
      <CardHeader>
        <CardTitle>General</CardTitle>
        <CardDescription>Display name and description for your server.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="srv-name">Name</Label>
          <Input id="srv-name" value={name} onChange={(e) => setName(e.target.value)} />
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
// Startup + variables
// ---------------------------------------------------------------------------
function StartupTab({ server }: { server: Server }) {
  const queryClient = useQueryClient();
  const [startupCommand, setStartupCommand] = useState(server.startupCommand ?? "");
  const [dockerImage, setDockerImage] = useState(server.dockerImage ?? "");

  const startupMutation = useMutation({
    mutationFn: () => api.servers.updateStartup(server.id, { startupCommand, dockerImage }),
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
    </div>
  );
}

function VariablesCard({ id }: { id: string }) {
  const { data: variables, isLoading } = useQuery({
    queryKey: ["server-variables", id],
    queryFn: () => api.servers.variables(id),
  });

  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (variables) {
      setValues(Object.fromEntries(variables.map((v) => [v.envName, v.value])));
    }
  }, [variables]);

  // Surface MINECRAFT_VERSION as a dropdown when the server exposes it.
  const hasMinecraftVersion = !!variables?.some(
    (v) => v.envName === "MINECRAFT_VERSION",
  );
  const { data: mcVersions } = useQuery({
    queryKey: ["catalog", "minecraft-versions"],
    queryFn: () => api.catalog.minecraftVersions(),
    enabled: hasMinecraftVersion,
  });

  const queryClient = useQueryClient();
  const saveMutation = useMutation({
    mutationFn: (envName: string) =>
      api.servers.setVariable(id, envName, values[envName] ?? ""),
    onSuccess: () => {
      toast.success("Variable saved");
      queryClient.invalidateQueries({ queryKey: ["server-variables", id] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to save variable"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Server variables</CardTitle>
        <CardDescription>Environment values passed to your server on boot.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : variables?.length ? (
          variables.map((v) => {
            const dirty = (values[v.envName] ?? "") !== v.value;
            const isMcVersion = v.envName === "MINECRAFT_VERSION";
            return (
              <div key={v.envName} className="grid gap-2 sm:grid-cols-[12rem_1fr_auto] sm:items-center">
                <Label className="font-mono text-xs">{v.envName}</Label>
                {isMcVersion ? (
                  <Select
                    value={values[v.envName] ?? ""}
                    onValueChange={(val) =>
                      setValues((s) => ({ ...s, [v.envName]: val }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select version" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="latest">Latest (recommended)</SelectItem>
                      {/* Keep the current value selectable even if not in the list. */}
                      {values[v.envName] &&
                        values[v.envName] !== "latest" &&
                        !(mcVersions?.versions ?? []).includes(values[v.envName]) && (
                          <SelectItem value={values[v.envName]}>
                            {values[v.envName]}
                          </SelectItem>
                        )}
                      {(mcVersions?.versions ?? []).map((ver) => (
                        <SelectItem key={ver} value={ver}>
                          {ver}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={values[v.envName] ?? ""}
                    onChange={(e) =>
                      setValues((s) => ({ ...s, [v.envName]: e.target.value }))
                    }
                  />
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!dirty}
                  loading={saveMutation.isPending && saveMutation.variables === v.envName}
                  onClick={() => saveMutation.mutate(v.envName)}
                >
                  Save
                </Button>
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
      toast.error(e instanceof ApiError ? e.message : "Failed to rotate password"),
  });

  const copyPw = async () => {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed);
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
          Connect with any SFTP client using your account password.
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
                <Input readOnly value={String(sftp.port)} className="font-mono" />
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
            <Button type="button" variant="outline" size="icon" onClick={copyPw} aria-label="Copy password">
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
    setPerms((p) => (p.includes(perm) ? p.filter((x) => x !== perm) : [...p, perm]));

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
      toast.error(e instanceof ApiError ? e.message : "Failed to invite sub-user"),
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
      toast.error(e instanceof ApiError ? e.message : "Failed to update permissions"),
  });

  const removeMutation = useMutation({
    mutationFn: (subId: string) => api.servers.removeSubUser(id, subId),
    onSuccess: () => {
      toast.success("Sub-user removed");
      invalidate();
      setRemoveTarget(null);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to remove sub-user"),
  });

  const openEdit = (su: SubUser) => {
    setEditing(su);
    setPerms(su.permissions);
  };

  const PermissionGrid = (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {PERMISSIONS.map((perm) => (
        <label
          key={perm}
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors",
            perms.includes(perm) && "border-primary bg-primary/5",
          )}
        >
          <input
            type="checkbox"
            className="size-4 accent-[hsl(var(--primary))]"
            checked={perms.includes(perm)}
            onChange={() => togglePerm(perm)}
          />
          <span className="font-mono text-xs">{perm}</span>
        </label>
      ))}
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Sub-users</CardTitle>
          <CardDescription>Grant scoped access to other people.</CardDescription>
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
                  {su.permissions.length} permission{su.permissions.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={su.state === "ACTIVE" ? "success" : "muted"}>
                  {su.state === "ACTIVE" ? "Active" : "Revoked"}
                </Badge>
                <Button variant="outline" size="sm" onClick={() => openEdit(su)}>
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
        <DialogContent>
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
              {PermissionGrid}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit permissions</DialogTitle>
            <DialogDescription>{editing?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Permissions</Label>
            {PermissionGrid}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button loading={updateMutation.isPending} onClick={() => updateMutation.mutate()}>
              Save permissions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirm */}
      <Dialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove sub-user</DialogTitle>
            <DialogDescription>
              Revoke access for <span className="font-medium">{removeTarget?.email}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={removeMutation.isPending}
              onClick={() => removeTarget && removeMutation.mutate(removeTarget.id)}
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
      toast.error(e instanceof ApiError ? e.message : "Failed to start reinstall"),
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
              This reinstalls the game and may overwrite existing files. The server will be offline
              during the process. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>Create a backup first if you need to preserve any current data.</span>
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
