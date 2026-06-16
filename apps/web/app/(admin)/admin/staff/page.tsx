"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Pencil, Trash2, Upload } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AvatarGroup } from "@/components/ui/avatar-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { imageToAvatarDataUrl } from "@/lib/utils";
import type { TeamMember } from "@/lib/types";

interface StaffForm {
  id?: string;
  name: string;
  title: string;
  bio: string;
  avatarUrl: string;
  link: string;
  isActive: boolean;
  sortOrder: number;
}

const emptyForm: StaffForm = {
  name: "",
  title: "",
  bio: "",
  avatarUrl: "",
  link: "",
  isActive: true,
  sortOrder: 0,
};

export default function AdminStaffPage() {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<StaffForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: staff, isLoading } = useQuery({
    queryKey: ["admin", "staff"],
    queryFn: () => api.admin.staff(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });

  const saveMutation = useMutation({
    mutationFn: (input: Partial<TeamMember>) => api.admin.saveStaff(input),
    onSuccess: () => {
      toast.success("Saved");
      invalidate();
      setEditOpen(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to save"),
  });

  const toggleMutation = useMutation({
    mutationFn: (m: TeamMember) => api.admin.saveStaff({ id: m.id, isActive: !m.isActive }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to update"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.admin.deleteStaff(id),
    onSuccess: () => {
      toast.success("Removed");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to remove"),
  });

  function openNew() {
    setForm({ ...emptyForm, sortOrder: staff?.length ?? 0 });
    setEditOpen(true);
  }
  function openEdit(m: TeamMember) {
    setForm({
      id: m.id,
      name: m.name,
      title: m.title,
      bio: m.bio ?? "",
      avatarUrl: m.avatarUrl ?? "",
      link: m.link ?? "",
      isActive: m.isActive,
      sortOrder: m.sortOrder,
    });
    setEditOpen(true);
  }

  async function onPickFile(file: File) {
    try {
      const dataUrl = await imageToAvatarDataUrl(file);
      setForm((f) => ({ ...f, avatarUrl: dataUrl }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load image");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff"
        description="Curate the public “Meet the team” page (/team)."
        actions={
          <Button onClick={openNew}>
            <Plus className="size-4" /> Add member
          </Button>
        }
      />

      {!isLoading && staff && staff.length > 0 && (
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <AvatarGroup items={staff.map((m) => ({ name: m.name, avatarUrl: m.avatarUrl }))} />
            <p className="text-sm text-muted-foreground">
              {staff.filter((m) => m.isActive).length} shown publicly · {staff.length} total
            </p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : staff?.length ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="hidden sm:table-cell">Order</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 place-items-center overflow-hidden rounded-full bg-white/10 text-xs font-semibold">
                          {m.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.avatarUrl} alt="" className="size-full object-cover" />
                          ) : (
                            m.name.slice(0, 2).toUpperCase()
                          )}
                        </span>
                        {m.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.title}</TableCell>
                    <TableCell className="hidden tabular-nums text-muted-foreground sm:table-cell">
                      {m.sortOrder}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={m.isActive}
                        disabled={toggleMutation.isPending}
                        onCheckedChange={() => toggleMutation.mutate(m)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(m)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(m)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={Users}
          title="No team members yet"
          description="Add your first team member to populate the public Team page."
          action={
            <Button onClick={openNew}>
              <Plus className="size-4" /> Add member
            </Button>
          }
        />
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? `Edit ${form.name || "member"}` : "Add member"}</DialogTitle>
            <DialogDescription>Shown on the public Team page when active.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="grid size-16 place-items-center overflow-hidden rounded-full bg-white/10 text-sm font-semibold">
                {form.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.avatarUrl} alt="" className="size-full object-cover" />
                ) : (
                  (form.name || "?").slice(0, 2).toUpperCase()
                )}
              </span>
              <div className="space-y-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onPickFile(f);
                    e.target.value = "";
                  }}
                />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <Upload className="size-4" /> Upload
                </Button>
                {form.avatarUrl && (
                  <Button variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, avatarUrl: "" }))}>
                    Remove
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input placeholder="Founder" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Bio</Label>
              <Textarea rows={3} value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Avatar URL (or upload above)</Label>
                <Input placeholder="https://…" value={form.avatarUrl.startsWith("data:") ? "" : form.avatarUrl}
                  onChange={(e) => setForm((f) => ({ ...f, avatarUrl: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Profile link (optional)</Label>
                <Input placeholder="https://…" value={form.link} onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Display order</Label>
                <Input type="number" min={0} value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))} />
              </div>
              <div className="flex items-end justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Active</p>
                  <p className="text-xs text-muted-foreground">Show on the public page.</p>
                </div>
                <Switch checked={form.isActive} onCheckedChange={(v: boolean) => setForm((f) => ({ ...f, isActive: v }))} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              loading={saveMutation.isPending}
              disabled={!form.name.trim() || !form.title.trim()}
              onClick={() =>
                saveMutation.mutate({
                  id: form.id,
                  name: form.name,
                  title: form.title,
                  bio: form.bio || undefined,
                  avatarUrl: form.avatarUrl || undefined,
                  link: form.link || undefined,
                  isActive: form.isActive,
                  sortOrder: form.sortOrder,
                })
              }
            >
              {form.id ? "Save changes" : "Add member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>This removes them from the public Team page.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" loading={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
