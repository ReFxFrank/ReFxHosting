"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Pencil, Trash2, Tag, MessageSquareText } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/input";
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
import type { CannedResponse, TicketCategory } from "@/lib/types";

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default function SupportSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Support settings"
        description="Ticket categories (with SLA targets) and reusable canned responses."
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/support">
              <ArrowLeft className="size-4" /> Back to tickets
            </Link>
          </Button>
        }
      />
      <CategoriesCard />
      <CannedResponsesCard />
    </div>
  );
}

// ---- Categories -----------------------------------------------------------

interface CategoryForm {
  id?: string;
  name: string;
  slug: string;
  slaFirstResponseMin: number;
  slaResolutionMin: number;
}
const emptyCategory: CategoryForm = {
  name: "",
  slug: "",
  slaFirstResponseMin: 240,
  slaResolutionMin: 2880,
};

function CategoriesCard() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [form, setForm] = useState<CategoryForm>(emptyCategory);
  const [deleteTarget, setDeleteTarget] = useState<TicketCategory | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["support", "categories"],
    queryFn: () => api.support.categories(),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["support", "categories"] });

  const save = useMutation({
    mutationFn: () =>
      form.id
        ? api.support.updateCategory(form.id, {
            name: form.name,
            slug: form.slug,
            slaFirstResponseMin: form.slaFirstResponseMin,
            slaResolutionMin: form.slaResolutionMin,
          })
        : api.support.createCategory({
            name: form.name,
            slug: form.slug,
            slaFirstResponseMin: form.slaFirstResponseMin,
            slaResolutionMin: form.slaResolutionMin,
          }),
    onSuccess: () => {
      toast.success("Category saved");
      setOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to save"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.support.deleteCategory(id),
    onSuccess: () => {
      toast.success("Category deleted");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to delete"),
  });

  function openNew() {
    setForm(emptyCategory);
    setSlugTouched(false);
    setOpen(true);
  }
  function openEdit(c: TicketCategory) {
    setForm({
      id: c.id,
      name: c.name,
      slug: c.slug,
      slaFirstResponseMin: c.slaFirstResponseMin,
      slaResolutionMin: c.slaResolutionMin,
    });
    setSlugTouched(true);
    setOpen(true);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="size-4" /> Ticket categories
          </CardTitle>
          <CardDescription>Used to triage tickets and set SLA targets.</CardDescription>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="size-4" /> New category
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4">
            <ListSkeleton rows={3} />
          </div>
        ) : data?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>First response SLA</TableHead>
                <TableHead>Resolution SLA</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{c.slug}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.slaFirstResponseMin} min</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.slaResolutionMin} min</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(c)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(c)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-4">
            <EmptyState icon={Tag} title="No categories" description="Add a category to triage tickets." />
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit category" : "New category"}</DialogTitle>
            <DialogDescription>SLA targets are in minutes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cat-name">Name</Label>
                <Input
                  id="cat-name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      name: e.target.value,
                      slug: slugTouched ? f.slug : slugify(e.target.value),
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-slug">Slug</Label>
                <Input
                  id="cat-slug"
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm((f) => ({ ...f, slug: e.target.value }));
                  }}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-fr">First response (min)</Label>
                <Input
                  id="cat-fr"
                  type="number"
                  min={1}
                  value={form.slaFirstResponseMin}
                  onChange={(e) => setForm((f) => ({ ...f, slaFirstResponseMin: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-res">Resolution (min)</Label>
                <Input
                  id="cat-res"
                  type="number"
                  min={1}
                  value={form.slaResolutionMin}
                  onChange={(e) => setForm((f) => ({ ...f, slaResolutionMin: Number(e.target.value) }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={save.isPending}
              disabled={!form.name.trim() || !form.slug.trim()}
              onClick={() => save.mutate()}
            >
              {form.id ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              Tickets in this category become uncategorised. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              loading={remove.isPending}
              onClick={() => deleteTarget && remove.mutate(deleteTarget.id)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---- Canned responses -----------------------------------------------------

interface CannedForm {
  id?: string;
  title: string;
  body: string;
  tags: string;
}
const emptyCanned: CannedForm = { title: "", body: "", tags: "" };

function CannedResponsesCard() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CannedForm>(emptyCanned);
  const [deleteTarget, setDeleteTarget] = useState<CannedResponse | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["support", "canned"],
    queryFn: () => api.support.cannedResponses(),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["support", "canned"] });

  const save = useMutation({
    mutationFn: () => {
      const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
      return form.id
        ? api.support.updateCannedResponse(form.id, { title: form.title, body: form.body, tags })
        : api.support.createCannedResponse({ title: form.title, body: form.body, tags });
    },
    onSuccess: () => {
      toast.success("Canned response saved");
      setOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to save"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.support.deleteCannedResponse(id),
    onSuccess: () => {
      toast.success("Canned response deleted");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to delete"),
  });

  function openNew() {
    setForm(emptyCanned);
    setOpen(true);
  }
  function openEdit(c: CannedResponse) {
    setForm({ id: c.id, title: c.title, body: c.body, tags: c.tags.join(", ") });
    setOpen(true);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquareText className="size-4" /> Canned responses
          </CardTitle>
          <CardDescription>Reusable replies staff can insert into a ticket.</CardDescription>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="size-4" /> New response
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4">
            <ListSkeleton rows={3} />
          </div>
        ) : data?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Preview</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.title}</TableCell>
                  <TableCell className="max-w-[20rem] truncate text-sm text-muted-foreground">{c.body}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(c)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(c)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-4">
            <EmptyState icon={MessageSquareText} title="No canned responses" description="Add a reusable reply your team can drop into tickets." />
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit response" : "New response"}</DialogTitle>
            <DialogDescription>Comma-separate tags for quick searching.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="canned-title">Title</Label>
              <Input
                id="canned-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="canned-body">Body</Label>
              <Textarea
                id="canned-body"
                rows={6}
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="canned-tags">Tags</Label>
              <Input
                id="canned-tags"
                placeholder="billing, refund, setup"
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={save.isPending}
              disabled={!form.title.trim() || !form.body.trim()}
              onClick={() => save.mutate()}
            >
              {form.id ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.title}?</DialogTitle>
            <DialogDescription>This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              loading={remove.isPending}
              onClick={() => deleteTarget && remove.mutate(deleteTarget.id)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
