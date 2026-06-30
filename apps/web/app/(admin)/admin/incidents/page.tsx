"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Siren, Plus, Trash2, MessageSquarePlus, CheckCircle2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { formatDateTime } from "@/lib/utils";
import type {
  StatusIncident,
  IncidentImpact,
  IncidentStatusStage,
} from "@/lib/types";

const COMPONENTS: { key: string; label: string }[] = [
  { key: "panel-api", label: "Control Panel API" },
  { key: "web", label: "Web Dashboard" },
  { key: "nodes", label: "Game Server Nodes" },
  { key: "ios-app", label: "iOS App" },
];
const IMPACTS: IncidentImpact[] = ["MAINTENANCE", "DEGRADED", "OUTAGE"];
const STAGES: IncidentStatusStage[] = ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"];

const impactVariant: Record<IncidentImpact, BadgeProps["variant"]> = {
  MAINTENANCE: "secondary",
  DEGRADED: "warning",
  OUTAGE: "destructive",
};

export default function AdminIncidentsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [create, setCreate] = useState({
    title: "",
    impact: "DEGRADED" as IncidentImpact,
    status: "INVESTIGATING" as IncidentStatusStage,
    components: [] as string[],
    body: "",
    notify: false,
  });
  const [updateTarget, setUpdateTarget] = useState<StatusIncident | null>(null);
  const [update, setUpdate] = useState({ status: "IDENTIFIED" as IncidentStatusStage, body: "" });
  const [deleteTarget, setDeleteTarget] = useState<StatusIncident | null>(null);

  const { data: incidents, isLoading } = useQuery({
    queryKey: ["admin", "incidents"],
    queryFn: () => api.admin.incidents(),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "incidents"] });

  const createMut = useMutation({
    mutationFn: () => api.admin.createIncident(create),
    onSuccess: () => {
      toast.success("Incident posted");
      invalidate();
      setCreateOpen(false);
      setCreate({ title: "", impact: "DEGRADED", status: "INVESTIGATING", components: [], body: "", notify: false });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to post incident"),
  });

  const updateMut = useMutation({
    mutationFn: () =>
      api.admin.addIncidentUpdate(updateTarget!.id, { status: update.status, body: update.body }),
    onSuccess: () => {
      toast.success("Update posted");
      invalidate();
      setUpdateTarget(null);
      setUpdate({ status: "IDENTIFIED", body: "" });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to post update"),
  });

  const resolveMut = useMutation({
    mutationFn: (id: string) => api.admin.updateIncident(id, { status: "RESOLVED" }),
    onSuccess: () => {
      toast.success("Incident resolved");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to resolve"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.admin.deleteIncident(id),
    onSuccess: () => {
      toast.success("Incident deleted");
      invalidate();
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to delete"),
  });

  const toggleComponent = (key: string) =>
    setCreate((c) => ({
      ...c,
      components: c.components.includes(key)
        ? c.components.filter((k) => k !== key)
        : [...c.components, key],
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Status incidents"
        description="Post incidents and maintenance to the public /status page. While unresolved, an incident drives the affected components' status (including the iOS App, which has no automatic signal)."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New incident
          </Button>
        }
      />

      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : incidents?.length ? (
        <div className="space-y-3">
          {incidents.map((inc) => (
            <Card key={inc.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={impactVariant[inc.impact]}>{inc.impact}</Badge>
                      <Badge variant={inc.resolvedAt ? "success" : "secondary"}>{inc.status}</Badge>
                      <p className="font-medium">{inc.title}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {inc.components.join(", ") || "no components"} · started{" "}
                      {formatDateTime(inc.startedAt)}
                      {inc.resolvedAt ? ` · resolved ${formatDateTime(inc.resolvedAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setUpdate({ status: "IDENTIFIED", body: "" });
                        setUpdateTarget(inc);
                      }}
                    >
                      <MessageSquarePlus className="size-4" /> Update
                    </Button>
                    {!inc.resolvedAt && (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={resolveMut.isPending}
                        onClick={() => resolveMut.mutate(inc.id)}
                      >
                        <CheckCircle2 className="size-4" /> Resolve
                      </Button>
                    )}
                    <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(inc)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <ol className="space-y-1 border-l border-border pl-4 text-sm">
                  {inc.updates.map((u, i) => (
                    <li key={u.id ?? i}>
                      <span className="font-medium">{u.status}</span>{" "}
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(u.createdAt)}
                      </span>
                      <p className="text-muted-foreground">{u.body}</p>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Siren}
          title="No incidents"
          description="Post an incident or scheduled maintenance to inform customers on the public status page."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> New incident
            </Button>
          }
        />
      )}

      <StatusWebhooksCard />

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New incident</DialogTitle>
            <DialogDescription>Posts immediately to the public status page.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="inc-title">Title</Label>
              <Input
                id="inc-title"
                placeholder="Elevated latency in CA-East"
                value={create.title}
                onChange={(e) => setCreate((c) => ({ ...c, title: e.target.value }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Impact</Label>
                <Select
                  value={create.impact}
                  onValueChange={(v) => setCreate((c) => ({ ...c, impact: v as IncidentImpact }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {IMPACTS.map((i) => (
                      <SelectItem key={i} value={i}>{i}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Initial status</Label>
                <Select
                  value={create.status}
                  onValueChange={(v) => setCreate((c) => ({ ...c, status: v as IncidentStatusStage }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAGES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Affected components</Label>
              <div className="flex flex-wrap gap-2">
                {COMPONENTS.map((c) => {
                  const on = create.components.includes(c.key);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => toggleComponent(c.key)}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                        on
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inc-body">First update</Label>
              <Textarea
                id="inc-body"
                placeholder="We are investigating reports of…"
                value={create.body}
                onChange={(e) => setCreate((c) => ({ ...c, body: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Notify all customers</p>
                <p className="text-xs text-muted-foreground">
                  Sends an in-app notification, push, and email. Use for major incidents only.
                </p>
              </div>
              <Switch
                checked={create.notify}
                onCheckedChange={(v: boolean) => setCreate((c) => ({ ...c, notify: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              loading={createMut.isPending}
              disabled={!create.title.trim() || !create.body.trim() || create.components.length === 0}
              onClick={() => createMut.mutate()}
            >
              Post incident
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post update */}
      <Dialog open={!!updateTarget} onOpenChange={(o) => !o && setUpdateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Post update</DialogTitle>
            <DialogDescription>{updateTarget?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={update.status}
                onValueChange={(v) => setUpdate((u) => ({ ...u, status: v as IncidentStatusStage }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="upd-body">Message</Label>
              <Textarea
                id="upd-body"
                placeholder="We identified the cause and are applying a fix…"
                value={update.body}
                onChange={(e) => setUpdate((u) => ({ ...u, body: e.target.value }))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Setting status to <strong>RESOLVED</strong> marks the incident resolved and clears the
              affected components.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setUpdateTarget(null)}>Cancel</Button>
            <Button
              loading={updateMut.isPending}
              disabled={!update.body.trim()}
              onClick={() => updateMut.mutate()}
            >
              Post update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete incident</DialogTitle>
            <DialogDescription>
              This permanently removes <strong>{deleteTarget?.title}</strong> and its timeline.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              loading={deleteMut.isPending}
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const WEBHOOK_EVENTS = [
  "incident.created",
  "incident.updated",
  "incident.resolved",
  "component.status_changed",
];

/**
 * Manage outbound status webhooks (real-time pushes to bots/monitors like
 * Helios). Creating one returns a one-time signing secret — shown once.
 */
function StatusWebhooksCard() {
  const qc = useQueryClient();
  const { data: hooks } = useQuery({
    queryKey: ["admin", "status-webhooks"],
    queryFn: () => api.admin.statusWebhooks(),
  });
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () =>
      api.admin.createStatusWebhook({ url: url.trim(), description: description.trim() || undefined }),
    onSuccess: (res) => {
      setNewSecret(res.secret);
      setUrl("");
      setDescription("");
      qc.invalidateQueries({ queryKey: ["admin", "status-webhooks"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to add webhook"),
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.admin.updateStatusWebhook(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "status-webhooks"] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.admin.deleteStatusWebhook(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "status-webhooks"] }),
  });

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <h3 className="font-semibold">Status webhooks</h3>
          <p className="text-sm text-muted-foreground">
            Push a signed POST on component status changes and incident
            create/update/resolve. Verify the{" "}
            <code className="text-xs">X-ReFx-Signature</code> HMAC against the
            secret. Events: {WEBHOOK_EVENTS.join(", ")}.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="https://bot.example.com/refx/webhook"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Input
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="sm:max-w-[14rem]"
          />
          <Button
            disabled={!url.trim()}
            loading={createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            <Plus className="size-4" /> Add
          </Button>
        </div>

        {newSecret && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium text-amber-100">
              Signing secret — copy it now, it won&apos;t be shown again:
            </p>
            <code className="mt-1 block break-all font-mono text-xs">{newSecret}</code>
            <button
              className="mt-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setNewSecret(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {hooks?.length ? (
          <div className="space-y-2">
            {hooks.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs">{h.url}</p>
                  <p className="text-xs text-muted-foreground">
                    {h.description ? `${h.description} · ` : ""}
                    {h.lastDeliveryAt
                      ? `last ${h.lastStatus ?? "—"} at ${formatDateTime(h.lastDeliveryAt)}`
                      : "no deliveries yet"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Switch
                    checked={h.isActive}
                    onCheckedChange={(v) => toggleMut.mutate({ id: h.id, isActive: v })}
                  />
                  <button
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => deleteMut.mutate(h.id)}
                    aria-label="Delete webhook"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No webhooks configured.</p>
        )}
      </CardContent>
    </Card>
  );
}
