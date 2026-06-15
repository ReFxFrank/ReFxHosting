"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus, Pencil, Trash2 } from "lucide-react";
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
import type { AlertSeverity, GlobalAlert } from "@/lib/types";

const SEVERITY_OPTIONS: { value: AlertSeverity; label: string }[] = [
  { value: "INFO", label: "Info" },
  { value: "WARNING", label: "Warning" },
  { value: "CRITICAL", label: "Critical" },
];

const severityVariant: Record<AlertSeverity, BadgeProps["variant"]> = {
  INFO: "secondary",
  WARNING: "warning",
  CRITICAL: "destructive",
};

interface AlertForm {
  id?: string;
  severity: AlertSeverity;
  title: string;
  body: string;
  isActive: boolean;
  startsAt: string;
  endsAt: string;
}

const emptyForm: AlertForm = {
  severity: "INFO",
  title: "",
  body: "",
  isActive: true,
  startsAt: "",
  endsAt: "",
};

// datetime-local <-> ISO helpers.
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}

export default function AdminAlertsPage() {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<AlertForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<GlobalAlert | null>(null);

  const { data: alerts, isLoading } = useQuery({
    queryKey: ["admin", "alerts"],
    queryFn: () => api.admin.alerts(),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "alerts"] });

  const saveMutation = useMutation({
    mutationFn: (input: Partial<GlobalAlert>) => api.admin.saveAlert(input),
    onSuccess: () => {
      toast.success("Alert saved");
      invalidate();
      setEditOpen(false);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to save alert"),
  });

  const toggleMutation = useMutation({
    mutationFn: (alert: GlobalAlert) =>
      api.admin.saveAlert({ id: alert.id, isActive: !alert.isActive }),
    onSuccess: () => {
      toast.success("Alert updated");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to update alert"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.admin.deleteAlert(id),
    onSuccess: () => {
      toast.success("Alert deleted");
      invalidate();
      setDeleteTarget(null);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to delete alert"),
  });

  function openNew() {
    setForm(emptyForm);
    setEditOpen(true);
  }

  function openEdit(alert: GlobalAlert) {
    setForm({
      id: alert.id,
      severity: alert.severity,
      title: alert.title,
      body: alert.body,
      isActive: alert.isActive,
      startsAt: toLocalInput(alert.startsAt),
      endsAt: toLocalInput(alert.endsAt),
    });
    setEditOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Global alerts"
        description="Banner notices shown across the panel to all users."
        actions={
          <Button onClick={openNew}>
            <Plus className="size-4" /> New alert
          </Button>
        }
      />

      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : alerts?.length ? (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <Card key={alert.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={severityVariant[alert.severity]}>
                      {alert.severity}
                    </Badge>
                    <p className="truncate font-medium">{alert.title}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{alert.body}</p>
                  {(alert.startsAt || alert.endsAt) && (
                    <p className="text-xs text-muted-foreground">
                      {alert.startsAt ? formatDateTime(alert.startsAt) : "now"} →{" "}
                      {alert.endsAt ? formatDateTime(alert.endsAt) : "indefinite"}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch
                    checked={alert.isActive}
                    disabled={toggleMutation.isPending}
                    onCheckedChange={() => toggleMutation.mutate(alert)}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openEdit(alert)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeleteTarget(alert)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Megaphone}
          title="No alerts"
          description="Create a global alert to notify all users of maintenance or incidents."
          action={
            <Button onClick={openNew}>
              <Plus className="size-4" /> New alert
            </Button>
          }
        />
      )}

      {/* Create / edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit alert" : "New alert"}</DialogTitle>
            <DialogDescription>
              This banner is shown to all users while active.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select
                value={form.severity}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, severity: v as AlertSeverity }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="alert-title">Title</Label>
              <Input
                id="alert-title"
                placeholder="Scheduled maintenance"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="alert-body">Body</Label>
              <Textarea
                id="alert-body"
                placeholder="We will be performing maintenance on…"
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="alert-start">Starts at (optional)</Label>
                <Input
                  id="alert-start"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, startsAt: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="alert-end">Ends at (optional)</Label>
                <Input
                  id="alert-end"
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">
                  Inactive alerts are hidden from users.
                </p>
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v: boolean) => setForm((f) => ({ ...f, isActive: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={saveMutation.isPending}
              disabled={!form.title.trim() || !form.body.trim()}
              onClick={() =>
                saveMutation.mutate({
                  id: form.id,
                  severity: form.severity,
                  title: form.title,
                  body: form.body,
                  isActive: form.isActive,
                  startsAt: fromLocalInput(form.startsAt),
                  endsAt: fromLocalInput(form.endsAt),
                })
              }
            >
              Save alert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete alert</DialogTitle>
            <DialogDescription>
              This permanently removes <strong>{deleteTarget?.title}</strong>. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Delete alert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
