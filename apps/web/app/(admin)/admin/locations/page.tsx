"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Boxes, Plus, Pencil, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
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
import type { Region } from "@/lib/types";

const emptyForm = { code: "", name: "", country: "" };

export default function AdminLocationsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Region | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Region | null>(null);

  const { data: regions, isLoading } = useQuery({
    queryKey: ["admin", "locations"],
    queryFn: () => api.admin.locations(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "locations"] });
    // Keep the node-create picker in sync.
    queryClient.invalidateQueries({ queryKey: ["admin", "regions"] });
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      editing
        ? api.admin.updateLocation(editing.id, form)
        : api.admin.createLocation(form),
    onSuccess: () => {
      toast.success(editing ? "Location updated" : "Location added");
      setOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to save location"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.admin.deleteLocation(id),
    onSuccess: () => {
      toast.success("Location deleted");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to delete location"),
  });

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }
  function openEdit(r: Region) {
    setEditing(r);
    setForm({ code: r.code, name: r.name, country: r.country });
    setOpen(true);
  }

  const valid = form.code.trim() && form.name.trim() && form.country.trim();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Locations"
        description="Regions servers can be deployed to. New locations are immediately selectable when creating a node."
        actions={
          <Button onClick={openNew}>
            <Plus className="size-4" /> Add location
          </Button>
        }
      />

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : regions?.length ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {regions.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <span className="flex items-center gap-2 font-medium">
                        <MapPin className="size-4 text-muted-foreground" />
                        {r.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono">
                        {r.code}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.country}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(r)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(r)}
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
          icon={Boxes}
          title="No locations yet"
          description="Add a location, then create nodes in it to start placing servers."
          action={
            <Button onClick={openNew}>
              <Plus className="size-4" /> Add location
            </Button>
          }
        />
      )}

      {/* Add / edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit location" : "Add location"}</DialogTitle>
            <DialogDescription>
              The code is a short unique handle (e.g. <code>us-east</code>) used when assigning
              nodes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="loc-name">Name</Label>
              <Input
                id="loc-name"
                placeholder="US East"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="loc-code">Code</Label>
                <Input
                  id="loc-code"
                  placeholder="us-east"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loc-country">Country</Label>
                <Input
                  id="loc-country"
                  placeholder="US"
                  value={form.country}
                  onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={saveMutation.isPending}
              disabled={!valid}
              onClick={() => saveMutation.mutate()}
            >
              {editing ? "Save changes" : "Add location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              A location can only be deleted once it has no nodes. This can&apos;t be undone.
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
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
