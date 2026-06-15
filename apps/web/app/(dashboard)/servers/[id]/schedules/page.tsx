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
import type { Schedule, ScheduleAction, ScheduleTask } from "@/lib/types";

const ACTIONS: { value: ScheduleAction; label: string }[] = [
  { value: "COMMAND", label: "Send command" },
  { value: "POWER", label: "Power action" },
  { value: "BACKUP", label: "Create backup" },
];

const POWER_SIGNALS = ["start", "stop", "restart"] as const;

const CRON_PRESETS: { label: string; cron: string }[] = [
  { label: "Every day at 4am", cron: "0 4 * * *" },
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Weekly (Sun 4am)", cron: "0 4 * * 0" },
];

/** Draft used by the create/edit dialog. */
interface TaskDraft {
  action: ScheduleAction;
  payload: string;
  timeOffsetMs: number;
}

interface ScheduleDraft {
  name: string;
  cron: string;
  onlyWhenOnline: boolean;
  isActive: boolean;
  tasks: TaskDraft[];
}

const EMPTY_DRAFT: ScheduleDraft = {
  name: "",
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

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: Partial<Schedule> = {
        name: draft.name,
        cron: draft.cron,
        onlyWhenOnline: draft.onlyWhenOnline,
        isActive: draft.isActive,
        tasks: draft.tasks.map((t, i) => ({
          action: t.action,
          payload: t.payload,
          timeOffsetMs: t.timeOffsetMs,
          sortOrder: i,
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
    setDraft({
      name: schedule.name,
      cron: schedule.cron,
      onlyWhenOnline: schedule.onlyWhenOnline,
      isActive: schedule.isActive,
      tasks: schedule.tasks.length
        ? schedule.tasks
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((t) => ({ action: t.action, payload: t.payload, timeOffsetMs: t.timeOffsetMs }))
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
                      {schedule.nextRunAt ? formatRelative(schedule.nextRunAt) : "—"}
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
              <div className="flex flex-wrap gap-2 pt-1">
                {CRON_PRESETS.map((p) => (
                  <Button
                    key={p.cron}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDraft((d) => ({ ...d, cron: p.cron }))}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>

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
                        <Input
                          placeholder="Backup name (optional)"
                          value={task.payload}
                          onChange={(e) => updateTask(i, { payload: e.target.value })}
                        />
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
              disabled={!draft.name.trim() || !draft.cron.trim()}
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
