"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  Plus,
  Play,
  Pencil,
  Trash2,
  Clock,
  Wifi,
  GripVertical,
  Globe,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { formatRelative } from "@/lib/utils";
import { TIMEZONES } from "@/lib/timezones";
import { useAuthStore } from "@/store/auth";
import type { Schedule, ScheduleAction, ScheduleTask } from "@/lib/types";

const ACTIONS: { value: ScheduleAction; label: string }[] = [
  { value: "COMMAND", label: "Send command" },
  { value: "POWER", label: "Power action" },
  { value: "BACKUP", label: "Create backup" },
];

const POWER_SIGNALS = ["start", "stop", "restart"] as const;

/** Friendly frequency modes. `custom` falls back to a raw cron field. */
type SchedMode = "daily" | "weekly" | "hourly" | "custom";

const WEEKDAYS: { value: string; label: string }[] = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const pad2 = (s: string | number) => String(s).padStart(2, "0");

/** Turn a cron string into friendly builder fields when it matches a simple
 * daily / weekly / every-N-hours shape, else fall back to custom. */
function cronToBuilder(cron: string): {
  mode: SchedMode;
  time: string;
  weekday: string;
  everyHours: string;
} {
  const base = { mode: "custom" as SchedMode, time: "04:00", weekday: "0", everyHours: "6" };
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return base;
  const [m, h, dom, mon, dow] = parts;
  const isNum = (s: string) => /^\d+$/.test(s);
  if (dom === "*" && mon === "*") {
    // Daily: m h * * *
    if (isNum(m) && isNum(h) && dow === "*") {
      return { ...base, mode: "daily", time: `${pad2(h)}:${pad2(m)}` };
    }
    // Weekly: m h * * D
    if (isNum(m) && isNum(h) && isNum(dow)) {
      return { ...base, mode: "weekly", time: `${pad2(h)}:${pad2(m)}`, weekday: dow };
    }
    // Every N hours: 0 */N * * *
    const every = h.match(/^\*\/(\d+)$/);
    if (m === "0" && every && dow === "*") {
      return { ...base, mode: "hourly", everyHours: every[1] };
    }
  }
  return base;
}

/** Compute the effective cron string for a draft. */
function effectiveCron(d: ScheduleDraft): string {
  if (d.mode === "custom") return d.cron.trim();
  const [h, m] = d.time.split(":");
  const hour = String(Number(h));
  const min = String(Number(m));
  if (d.mode === "daily") return `${min} ${hour} * * *`;
  if (d.mode === "weekly") return `${min} ${hour} * * ${d.weekday}`;
  if (d.mode === "hourly") return `0 */${d.everyHours} * * *`;
  return "0 4 * * *";
}

/** A short human summary of the draft, shown live in the dialog. */
function describeDraft(d: ScheduleDraft): string {
  const timeLabel = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  };
  if (d.mode === "daily") return `Runs every day at ${timeLabel(d.time)}`;
  if (d.mode === "weekly")
    return `Runs every ${WEEKDAYS.find((w) => w.value === d.weekday)?.label} at ${timeLabel(d.time)}`;
  if (d.mode === "hourly")
    return `Runs every ${d.everyHours} hour${d.everyHours === "1" ? "" : "s"}`;
  return `Runs on cron: ${d.cron.trim() || "—"}`;
}

/** Absolute next-run time rendered in the customer's own timezone. */
function formatInTz(iso: string, tz: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return new Date(iso).toLocaleString();
  }
}

/** Draft used by the create/edit dialog. */
interface TaskDraft {
  action: ScheduleAction;
  payload: string;
  timeOffsetMs: number;
  /** BACKUP only: what to archive (default ESSENTIALS). */
  backupMode?: "ESSENTIALS" | "FULL";
}

interface ScheduleDraft {
  name: string;
  mode: SchedMode;
  time: string;
  weekday: string;
  everyHours: string;
  /** Authoritative only when mode === "custom". */
  cron: string;
  onlyWhenOnline: boolean;
  isActive: boolean;
  tasks: TaskDraft[];
}

const EMPTY_DRAFT: ScheduleDraft = {
  name: "",
  mode: "daily",
  time: "04:00",
  weekday: "0",
  everyHours: "6",
  cron: "0 4 * * *",
  onlyWhenOnline: true,
  isActive: true,
  tasks: [{ action: "COMMAND", payload: "", timeOffsetMs: 0 }],
};

function actionLabel(action: ScheduleAction) {
  return ACTIONS.find((a) => a.value === action)?.label ?? action;
}

export default function SchedulesPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const tz = user?.timezone || "UTC";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [draft, setDraft] = useState<ScheduleDraft>(EMPTY_DRAFT);
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null);

  const { data: schedules, isLoading } = useQuery({
    queryKey: ["server-schedules", id],
    queryFn: () => api.servers.schedules.list(id),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["server-schedules", id] });

  const tzMutation = useMutation({
    mutationFn: (timezone: string) => api.account.update({ timezone }),
    onSuccess: async () => {
      await refreshUser();
      // Existing schedules had their nextRunAt recomputed server-side — reload.
      invalidate();
      toast.success("Timezone saved — your schedules were rescheduled");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to update timezone"),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: Partial<Schedule> = {
        name: draft.name,
        cron: effectiveCron(draft),
        onlyWhenOnline: draft.onlyWhenOnline,
        isActive: draft.isActive,
        tasks: draft.tasks.map((t, i) => ({
          action: t.action,
          payload: t.payload,
          timeOffsetMs: t.timeOffsetMs,
          sortOrder: i,
          ...(t.action === "BACKUP"
            ? { options: { mode: t.backupMode ?? "ESSENTIALS" } }
            : {}),
        })) as ScheduleTask[],
      };
      return editing
        ? api.servers.schedules.update(id, editing.id, payload)
        : api.servers.schedules.create(id, payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Schedule updated" : "Schedule created");
      invalidate();
      setDialogOpen(false);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to save schedule"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ schedule, isActive }: { schedule: Schedule; isActive: boolean }) =>
      api.servers.schedules.update(id, schedule.id, { isActive }),
    onSuccess: () => invalidate(),
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to update schedule"),
  });

  const runMutation = useMutation({
    mutationFn: (scheduleId: string) => api.servers.schedules.run(id, scheduleId),
    onSuccess: () => {
      toast.success("Schedule triggered");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to run schedule"),
  });

  const deleteMutation = useMutation({
    mutationFn: (scheduleId: string) => api.servers.schedules.delete(id, scheduleId),
    onSuccess: () => {
      toast.success("Schedule deleted");
      invalidate();
      setDeleteTarget(null);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to delete schedule"),
  });

  const openCreate = () => {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setDialogOpen(true);
  };

  const openEdit = (schedule: Schedule) => {
    setEditing(schedule);
    const b = cronToBuilder(schedule.cron);
    setDraft({
      name: schedule.name,
      mode: b.mode,
      time: b.time,
      weekday: b.weekday,
      everyHours: b.everyHours,
      cron: schedule.cron,
      onlyWhenOnline: schedule.onlyWhenOnline,
      isActive: schedule.isActive,
      tasks: schedule.tasks.length
        ? schedule.tasks
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((t) => ({
              action: t.action,
              payload: t.payload,
              timeOffsetMs: t.timeOffsetMs,
              backupMode:
                t.options?.mode === "FULL"
                  ? ("FULL" as const)
                  : ("ESSENTIALS" as const),
            }))
        : [{ action: "COMMAND", payload: "", timeOffsetMs: 0 }],
    });
    setDialogOpen(true);
  };

  const updateTask = (index: number, patch: Partial<TaskDraft>) =>
    setDraft((d) => ({
      ...d,
      tasks: d.tasks.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    }));

  const addTask = () =>
    setDraft((d) => ({
      ...d,
      tasks: [...d.tasks, { action: "COMMAND", payload: "", timeOffsetMs: 0 }],
    }));

  const removeTask = (index: number) =>
    setDraft((d) => ({ ...d, tasks: d.tasks.filter((_, i) => i !== index) }));

  const cronValid = effectiveCron(draft).split(/\s+/).length === 5;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schedules"
        description="Automate commands, power actions and backups with cron-based schedules."
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" /> New schedule
          </Button>
        }
      />

      {/* Timezone — everything below runs in this zone. Surfaced here because a
          restart set for "4am" firing at the wrong hour is almost always a
          timezone mismatch, not a cron mistake. */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Globe className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Schedule timezone</p>
              <p className="text-xs text-muted-foreground">
                Times you pick (e.g. “4:00 AM”) run in this timezone. Changing it
                reschedules your existing schedules.
              </p>
            </div>
          </div>
          <Select
            value={tz}
            disabled={tzMutation.isPending}
            onValueChange={(v) => tzMutation.mutate(v)}
          >
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : schedules?.length ? (
        <div className="grid gap-4">
          {schedules.map((schedule) => (
            <Card key={schedule.id}>
              <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{schedule.name}</span>
                    <Badge variant="muted" className="font-mono">
                      {schedule.cron}
                    </Badge>
                    {schedule.onlyWhenOnline && (
                      <Badge variant="secondary">
                        <Wifi className="size-3" /> Only when online
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" /> Next:{" "}
                      {schedule.nextRunAt ? (
                        <>
                          {formatInTz(schedule.nextRunAt, tz)}{" "}
                          <span className="opacity-70">
                            ({formatRelative(schedule.nextRunAt)})
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </span>
                    <span>
                      Last: {schedule.lastRunAt ? formatRelative(schedule.lastRunAt) : "never"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={schedule.isActive}
                    disabled={toggleMutation.isPending}
                    onCheckedChange={(isActive: boolean) =>
                      toggleMutation.mutate({ schedule, isActive })
                    }
                    aria-label="Toggle schedule active"
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  {schedule.tasks.length ? (
                    schedule.tasks
                      .slice()
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                        >
                          <Badge variant="outline">{actionLabel(task.action)}</Badge>
                          <span className="truncate font-mono text-xs text-muted-foreground">
                            {task.payload || "—"}
                          </span>
                          {task.timeOffsetMs > 0 && (
                            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                              +{Math.round(task.timeOffsetMs / 1000)}s
                            </span>
                          )}
                        </div>
                      ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No tasks configured.</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    loading={runMutation.isPending && runMutation.variables === schedule.id}
                    onClick={() => runMutation.mutate(schedule.id)}
                  >
                    <Play className="size-4" /> Run now
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEdit(schedule)}>
                    <Pencil className="size-4" /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(schedule)}
                  >
                    <Trash2 className="size-4" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={CalendarClock}
          title="No schedules yet"
          description="Create a schedule to automate restarts, backups or in-game commands."
          action={
            <Button onClick={openCreate}>
              <Plus className="size-4" /> New schedule
            </Button>
          }
        />
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit schedule" : "New schedule"}</DialogTitle>
            <DialogDescription>
              Define when this runs and the tasks to execute.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sched-name">Name</Label>
              <Input
                id="sched-name"
                placeholder="Nightly restart"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </div>

            {/* Friendly frequency builder */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Frequency</Label>
                <Select
                  value={draft.mode}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, mode: v as SchedMode }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Every day</SelectItem>
                    <SelectItem value="weekly">Every week</SelectItem>
                    <SelectItem value="hourly">Every few hours</SelectItem>
                    <SelectItem value="custom">Custom (cron)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {draft.mode === "weekly" && (
                <div className="space-y-1.5">
                  <Label>Day</Label>
                  <Select
                    value={draft.weekday}
                    onValueChange={(v) => setDraft((d) => ({ ...d, weekday: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((w) => (
                        <SelectItem key={w.value} value={w.value}>
                          {w.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(draft.mode === "daily" || draft.mode === "weekly") && (
                <div className="space-y-1.5">
                  <Label htmlFor="sched-time">Time</Label>
                  <Input
                    id="sched-time"
                    type="time"
                    value={draft.time}
                    onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))}
                  />
                </div>
              )}

              {draft.mode === "hourly" && (
                <div className="space-y-1.5">
                  <Label htmlFor="sched-hours">Every</Label>
                  <Select
                    value={draft.everyHours}
                    onValueChange={(v) => setDraft((d) => ({ ...d, everyHours: v }))}
                  >
                    <SelectTrigger id="sched-hours">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["1", "2", "3", "4", "6", "8", "12"].map((h) => (
                        <SelectItem key={h} value={h}>
                          {h} hour{h === "1" ? "" : "s"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {draft.mode === "custom" ? (
              <div className="space-y-1.5">
                <Label htmlFor="sched-cron">Cron expression</Label>
                <Input
                  id="sched-cron"
                  value={draft.cron}
                  onChange={(e) => setDraft((d) => ({ ...d, cron: e.target.value }))}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">minute hour day month weekday</span>
                </p>
              </div>
            ) : (
              <p className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {describeDraft(draft)} ·{" "}
                <span className="opacity-70">
                  {tz} · cron{" "}
                  <span className="font-mono">{effectiveCron(draft)}</span>
                </span>
              </p>
            )}

            <label className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Only when online</p>
                <p className="text-xs text-muted-foreground">
                  Skip the run if the server is offline.
                </p>
              </div>
              <Switch
                checked={draft.onlyWhenOnline}
                onCheckedChange={(v: boolean) => setDraft((d) => ({ ...d, onlyWhenOnline: v }))}
              />
            </label>

            {/* Tasks editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Tasks</Label>
                <Button type="button" variant="ghost" size="sm" onClick={addTask}>
                  <Plus className="size-4" /> Add task
                </Button>
              </div>

              <div className="space-y-2">
                {draft.tasks.map((task, i) => (
                  <div key={i} className="rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                      <Select
                        value={task.action}
                        onValueChange={(v) =>
                          updateTask(i, {
                            action: v as ScheduleAction,
                            payload: v === "POWER" ? "restart" : "",
                          })
                        }
                      >
                        <SelectTrigger className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ACTIONS.map((a) => (
                            <SelectItem key={a.value} value={a.value}>
                              {a.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="ml-auto text-destructive hover:text-destructive"
                        disabled={draft.tasks.length === 1}
                        onClick={() => removeTask(i)}
                        aria-label="Remove task"
                      >
                        <Trash2 />
                      </Button>
                    </div>

                    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                      {task.action === "POWER" ? (
                        <Select
                          value={task.payload || "restart"}
                          onValueChange={(v) => updateTask(i, { payload: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {POWER_SIGNALS.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s.charAt(0).toUpperCase() + s.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : task.action === "BACKUP" ? (
                        <div className="flex flex-1 gap-2">
                          <Input
                            placeholder="Backup name (optional)"
                            value={task.payload}
                            onChange={(e) => updateTask(i, { payload: e.target.value })}
                          />
                          <Select
                            value={task.backupMode ?? "ESSENTIALS"}
                            onValueChange={(v) =>
                              updateTask(i, {
                                backupMode: v as "ESSENTIALS" | "FULL",
                              })
                            }
                          >
                            <SelectTrigger
                              className="w-36 shrink-0"
                              aria-label="Backup mode"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ESSENTIALS">Essentials</SelectItem>
                              <SelectItem value="FULL">Everything</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <Input
                          placeholder="say Restarting soon"
                          value={task.payload}
                          onChange={(e) => updateTask(i, { payload: e.target.value })}
                          className="font-mono"
                        />
                      )}

                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={0}
                          step={1000}
                          className="w-28"
                          value={task.timeOffsetMs}
                          onChange={(e) =>
                            updateTask(i, { timeOffsetMs: Number(e.target.value) || 0 })
                          }
                          aria-label="Time offset in milliseconds"
                        />
                        <span className="text-xs text-muted-foreground">ms delay</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={saveMutation.isPending}
              disabled={!draft.name.trim() || !cronValid}
              onClick={() => saveMutation.mutate()}
            >
              {editing ? "Save changes" : "Create schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete schedule</DialogTitle>
            <DialogDescription>
              This permanently deletes <span className="font-medium">{deleteTarget?.name}</span>.
              This action cannot be undone.
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
              Delete schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
