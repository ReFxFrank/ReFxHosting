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
      setCreate({ title: "", impact: "DEGRADED", status: "INVESTIGATING", components: [], body: "" });
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
