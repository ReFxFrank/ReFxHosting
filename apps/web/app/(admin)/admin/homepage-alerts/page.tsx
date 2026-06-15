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
import type { HomepageAlert, HomepageAlertType } from "@/lib/types";

const TYPE_OPTIONS: { value: HomepageAlertType; label: string }[] = [
  { value: "INFO", label: "Info" },
  { value: "SUCCESS", label: "Success" },
  { value: "WARNING", label: "Warning" },
  { value: "DANGER", label: "Danger" },
  { value: "PROMO", label: "Promo" },
];

const typeVariant: Record<HomepageAlertType, BadgeProps["variant"]> = {
  INFO: "secondary",
  SUCCESS: "success",
  WARNING: "warning",
  DANGER: "destructive",
  PROMO: "default",
};

interface AlertForm {
  id?: string;
  type: HomepageAlertType;
  title: string;
  body: string;
  isActive: boolean;
  dismissible: boolean;
  priority: number;
  ctaLabel: string;
  ctaUrl: string;
  startsAt: string;
  endsAt: string;
}

const emptyForm: AlertForm = {
  type: "INFO",
  title: "",
  body: "",
  isActive: true,
  dismissible: true,
  priority: 0,
  ctaLabel: "",
  ctaUrl: "",
  startsAt: "",
  endsAt: "",
};

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}

export default function AdminHomepageAlertsPage() {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<AlertForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<HomepageAlert | null>(null);

  const { data: alerts, isLoading } = useQuery({
    queryKey: ["admin", "homepage-alerts"],
    queryFn: () => api.admin.homepageAlerts(),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "homepage-alerts"] });

  const saveMutation = useMutation({
    mutationFn: (input: Partial<HomepageAlert>) => api.admin.saveHomepageAlert(input),
    onSuccess: () => {
      toast.success("Homepage alert saved");
      invalidate();
      setEditOpen(false);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to save alert"),
  });

  const toggleMutation = useMutation({
    mutationFn: (alert: HomepageAlert) =>
      api.admin.saveHomepageAlert({ id: alert.id, isActive: !alert.isActive }),
    onSuccess: () => {
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to update alert"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.admin.deleteHomepageAlert(id),
    onSuccess: () => {
      toast.success("Homepage alert deleted");
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

  function openEdit(alert: HomepageAlert) {
    setForm({
      id: alert.id,
      type: alert.type,
      title: alert.title,
      body: alert.body,
      isActive: alert.isActive,
      dismissible: alert.dismissible,
      priority: alert.priority,
      ctaLabel: alert.ctaLabel ?? "",
      ctaUrl: alert.ctaUrl ?? "",
      startsAt: toLocalInput(alert.startsAt),
      endsAt: toLocalInput(alert.endsAt),
    });
    setEditOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Homepage alerts"
        description="Public marketing/status notices shown on the storefront homepage — separate from the internal panel alerts."
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
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={typeVariant[alert.type]}>{alert.type}</Badge>
                    <p className="truncate font-medium">{alert.title}</p>
                    <span className="text-xs text-muted-foreground">
                      priority {alert.priority}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{alert.body}</p>
                  {alert.ctaLabel && alert.ctaUrl && (
                    <p className="text-xs text-primary">
                      CTA: {alert.ctaLabel} → {alert.ctaUrl}
                    </p>
                  )}
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
                  <Button variant="ghost" size="icon-sm" onClick={() => openEdit(alert)}>
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
          title="No homepage alerts"
          description="Create a public notice to highlight promotions, status updates or announcements on the storefront."
          action={
            <Button onClick={openNew}>
              <Plus className="size-4" /> New alert
            </Button>
          }
        />
      )}

      {/* Create / edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit homepage alert" : "New homepage alert"}</DialogTitle>
            <DialogDescription>
              Shown on the public homepage while active and within its schedule.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, type: v as HomepageAlertType }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:w-28">
                <Label htmlFor="ha-priority">Priority</Label>
                <Input
                  id="ha-priority"
                  type="number"
                  value={form.priority}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, priority: Number(e.target.value) }))
                  }
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ha-title">Title</Label>
              <Input
                id="ha-title"
                placeholder="Summer sale — 25% off"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ha-body">Body</Label>
              <Textarea
                id="ha-body"
                placeholder="Use code REFX25 at checkout…"
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ha-cta-label">CTA label (optional)</Label>
                <Input
                  id="ha-cta-label"
                  placeholder="Browse games"
                  value={form.ctaLabel}
                  onChange={(e) => setForm((f) => ({ ...f, ctaLabel: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ha-cta-url">CTA URL (optional)</Label>
                <Input
                  id="ha-cta-url"
                  placeholder="/games"
                  value={form.ctaUrl}
                  onChange={(e) => setForm((f) => ({ ...f, ctaUrl: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ha-start">Starts at (optional)</Label>
                <Input
                  id="ha-start"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ha-end">Ends at (optional)</Label>
                <Input
                  id="ha-end"
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex flex-1 items-center justify-between rounded-lg border p-3">
                <span className="text-sm font-medium">Active</span>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(v: boolean) => setForm((f) => ({ ...f, isActive: v }))}
                />
              </div>
              <div className="flex flex-1 items-center justify-between rounded-lg border p-3">
                <span className="text-sm font-medium">Dismissible</span>
                <Switch
                  checked={form.dismissible}
                  onCheckedChange={(v: boolean) =>
                    setForm((f) => ({ ...f, dismissible: v }))
                  }
                />
              </div>
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
                  type: form.type,
                  title: form.title,
                  body: form.body,
                  isActive: form.isActive,
                  dismissible: form.dismissible,
                  priority: Number(form.priority) || 0,
                  ctaLabel: form.ctaLabel || null,
                  ctaUrl: form.ctaUrl || null,
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
            <DialogTitle>Delete homepage alert</DialogTitle>
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
