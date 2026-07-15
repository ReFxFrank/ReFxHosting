"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";
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
import type { BugReport, BugSeverity, BugStatus } from "@/lib/types";

const COLUMNS: { status: BugStatus; label: string }[] = [
  { status: "NEW", label: "New" },
  { status: "TRIAGED", label: "Triaged" },
  { status: "IN_PROGRESS", label: "In progress" },
  { status: "RESOLVED", label: "Fixed" },
  { status: "CLOSED", label: "Closed" },
];
const SEVERITY_VARIANT: Record<BugSeverity, BadgeProps["variant"]> = {
  LOW: "outline",
  MEDIUM: "secondary",
  HIGH: "warning",
  CRITICAL: "destructive",
};
const SEVERITIES: BugSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function name(u?: { email: string; firstName: string | null } | null) {
  if (!u) return "Unassigned";
  return u.firstName || u.email;
}

export default function AdminBugsPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [severity, setSeverity] = useState<string>("all");
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "bugs", severity],
    queryFn: () =>
      api.admin.bugs(severity === "all" ? undefined : { severity }),
    refetchInterval: 30_000,
  });
  const byStatus = useMemo(() => {
    const m: Record<BugStatus, BugReport[]> = {
      NEW: [], TRIAGED: [], IN_PROGRESS: [], RESOLVED: [], CLOSED: [],
    };
    for (const r of data?.data ?? []) m[r.status]?.push(r);
    return m;
  }, [data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bug reports"
        description="Customer-submitted bugs. Triage severity, assign, comment, and move them across the board as you fix them."
        actions={
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              {SEVERITIES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s[0] + s.slice(1).toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {COLUMNS.map((col) => (
            <div key={col.status} className="space-y-2">
              <div className="flex items-center justify-between px-1 text-sm font-medium">
                <span>{col.label}</span>
                <span className="text-muted-foreground">
                  {byStatus[col.status].length}
                </span>
              </div>
              <div className="space-y-2">
                {byStatus[col.status].map((r) => (
                  <Card
                    key={r.id}
                    onClick={() => setOpenId(r.id)}
                    className="cursor-pointer transition-colors hover:border-primary/40"
                  >
                    <CardContent className="space-y-2 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          BUG-{r.number}
                        </span>
                        <Badge variant={SEVERITY_VARIANT[r.severity]}>
                          {r.severity}
                        </Badge>
                      </div>
                      <p className="line-clamp-2 text-sm font-medium">
                        {r.title}
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="truncate">
                          {r.reporter?.email ?? "—"}
                        </span>
                        {(r._count?.attachments ?? 0) > 0 && (
                          <Paperclip className="size-3" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {byStatus[col.status].length === 0 && (
                  <p className="px-1 text-xs text-muted-foreground">—</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {openId && <TriageDialog id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function TriageDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: bug, isLoading } = useQuery<BugReport>({
    queryKey: ["admin", "bug", id],
    queryFn: () => api.admin.bug(id),
  });
  const { data: staff } = useQuery({
    queryKey: ["admin", "bug-staff"],
    queryFn: () => api.admin.bugStaff(),
  });

  const [note, setNote] = useState("");
  const [internal, setInternal] = useState(true);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "bug", id] });
    qc.invalidateQueries({ queryKey: ["admin", "bugs"] });
  };

  const update = useMutation({
    mutationFn: (input: Parameters<typeof api.admin.updateBug>[1]) =>
      api.admin.updateBug(id, input),
    onSuccess: () => {
      toast.success("Bug updated");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Update failed"),
  });

  const comment = useMutation({
    mutationFn: () => api.admin.bugComment(id, note.trim(), internal),
    onSuccess: () => {
      setNote("");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Comment failed"),
  });

  const remove = useMutation({
    mutationFn: () => api.admin.deleteBug(id),
    onSuccess: () => {
      toast.success("Bug report deleted");
      qc.invalidateQueries({ queryKey: ["admin", "bugs"] });
      onClose();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Delete failed"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        {isLoading || !bug ? (
          <ListSkeleton rows={5} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  BUG-{bug.number}
                </span>
                {bug.title}
              </DialogTitle>
              <DialogDescription>
                Reported by {bug.reporter?.email ?? "unknown"}
                {bug.server ? ` · server ${bug.server.name}` : ""} ·{" "}
                {new Date(bug.createdAt).toLocaleString()}
              </DialogDescription>
            </DialogHeader>

            {/* Triage controls */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={bug.status}
                  onValueChange={(v) => update.mutate({ status: v as BugStatus })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COLUMNS.map((c) => (
                      <SelectItem key={c.status} value={c.status}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <Select
                  value={bug.severity}
                  onValueChange={(v) =>
                    update.mutate({ severity: v as BugSeverity })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s[0] + s.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Assignee</Label>
                <Select
                  value={bug.assigneeId ?? "none"}
                  onValueChange={(v) =>
                    update.mutate({ assigneeId: v === "none" ? null : v })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {(staff ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {name(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="area">Area (tag)</Label>
                <Input
                  id="area"
                  defaultValue={bug.area ?? ""}
                  placeholder="billing, console…"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (bug.area ?? "")) update.mutate({ area: v || null });
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="res">Resolution note (shown to reporter)</Label>
                <Input
                  id="res"
                  defaultValue={bug.resolutionNote ?? ""}
                  placeholder="What was fixed / why closed"
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v !== (bug.resolutionNote ?? ""))
                      update.mutate({ resolutionNote: v });
                  }}
                />
              </div>
            </div>

            {/* Report body + context */}
            <div className="space-y-3 text-sm">
              <div>
                <p className="mb-1 font-medium">Description</p>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {bug.description}
                </p>
              </div>
              {bug.stepsToReproduce && (
                <div>
                  <p className="mb-1 font-medium">Steps to reproduce</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {bug.stepsToReproduce}
                  </p>
                </div>
              )}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-muted-foreground">
                <div className="break-all">
                  <span className="text-foreground">Page:</span>{" "}
                  {bug.pageUrl ?? "—"}
                </div>
                <div className="break-all">
                  <span className="text-foreground">Browser:</span>{" "}
                  {bug.userAgent ?? "—"}
                </div>
                <div>
                  <span className="text-foreground">App:</span>{" "}
                  {bug.appVersion ?? "—"}
                </div>
              </div>

              {!!bug.attachments?.length && (
                <div className="flex flex-wrap gap-2">
                  {bug.attachments.map((a) => (
                    <a
                      key={a.id}
                      href={api.bugs.attachmentUrl(bug.id, a.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs hover:border-primary/40"
                    >
                      <Paperclip className="size-3" /> {a.fileName}
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Comments */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Activity</p>
              {(bug.comments ?? []).map((c) => (
                <div
                  key={c.id}
                  className={`rounded-lg border p-3 text-sm ${
                    c.isInternal
                      ? "border-amber-500/30 bg-amber-500/[0.05]"
                      : "border-white/[0.06] bg-white/[0.02]"
                  }`}
                >
                  <p className="mb-1 text-xs text-muted-foreground">
                    {c.author?.email ?? "system"}
                    {c.isInternal ? " · internal note" : " · reply to reporter"} ·{" "}
                    {new Date(c.createdAt).toLocaleString()}
                  </p>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
              <Textarea
                rows={2}
                placeholder={
                  internal
                    ? "Internal note (staff only)…"
                    : "Reply to the reporter…"
                }
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={internal}
                    onChange={(e) => setInternal(e.target.checked)}
                  />
                  Internal note (hidden from reporter)
                </label>
                <Button
                  size="sm"
                  loading={comment.isPending}
                  disabled={note.trim().length === 0}
                  onClick={() => comment.mutate()}
                >
                  Add
                </Button>
              </div>
            </div>

            <DialogFooter className="justify-between sm:justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                loading={remove.isPending}
                onClick={() => remove.mutate()}
              >
                <Trash2 className="size-4" /> Delete
              </Button>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
