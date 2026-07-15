"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Search, Plus, Pencil, Trash2, Lock } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { AdminRole } from "@/lib/types";

// Grouped permission catalog for the role editor. "Manage X" is the coarse
// grant that (server-side) implies every finer action in its area; the granular
// rows below it let an owner delegate one capability at a time.
const PERM_GROUPS: { title: string; perms: string[] }[] = [
  { title: "Dashboard", perms: ["dashboard.read"] },
  { title: "Servers", perms: ["servers.read", "servers.manage"] },
  {
    title: "Infrastructure",
    perms: ["nodes.read", "nodes.manage", "locations.manage"],
  },
  {
    title: "Customers",
    perms: [
      "users.read",
      "users.manage",
      "users.create",
      "users.suspend",
      "users.delete",
      "users.credit",
      "users.password",
      "users.verify-email",
    ],
  },
  {
    title: "Billing",
    perms: [
      "billing.read",
      "billing.manage",
      "billing.refund",
      "payments.manage",
    ],
  },
  { title: "Catalog", perms: ["catalog.read", "catalog.manage"] },
  { title: "Content", perms: ["content.read", "content.manage"] },
  { title: "Support", perms: ["support.read", "support.manage"] },
  { title: "Bug reports", perms: ["bugs.read", "bugs.manage"] },
  { title: "System", perms: ["audit.read", "settings.manage", "roles.manage"] },
];

/** Human labels for permissions; granular actions get an explicit name. */
const PERM_LABELS: Record<string, string> = {
  "users.manage": "Manage users (all)",
  "users.create": "Create accounts",
  "users.suspend": "Suspend / ban / reactivate",
  "users.delete": "Delete / purge",
  "users.credit": "Adjust store credit",
  "users.password": "Reset / set password",
  "users.verify-email": "Verify email",
  "billing.manage": "Manage billing (all)",
  "billing.refund": "Refund invoices",
  "payments.manage": "Manage payment gateways",
};

function permLabel(p: string) {
  if (PERM_LABELS[p]) return PERM_LABELS[p];
  const [area, action] = p.split(".");
  const verb = action === "read" ? "View" : "Manage";
  return `${verb} ${area}`;
}

const emptyForm = {
  key: "",
  name: "",
  description: "",
  permissions: [] as string[],
};

export default function AdminRolesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminRole | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<AdminRole | null>(null);
  // When set, the Assign list is filtered to members of this role id (click a
  // role's user count to audit exactly who holds it).
  const [memberFilter, setMemberFilter] = useState<string | null>(null);

  const rolesQ = useQuery({
    queryKey: ["admin", "roles"],
    queryFn: () => api.admin.roles(),
  });
  const usersQ = useQuery({
    queryKey: ["admin", "roles-users", search],
    // pageSize:100 so the "who has this role" member filter sees the whole
    // staff/owner set (default page is 25) — the assign list is a management
    // surface. (`take` is not a valid query param — the DTO uses page/pageSize.)
    queryFn: () =>
      api.admin.users({ pageSize: 100, ...(search ? { q: search } : {}) }),
  });

  const roles = rolesQ.data ?? [];
  const rolesById = useMemo(
    () => Object.fromEntries(roles.map((r) => [r.id, r])),
    [roles],
  );
  const rolesByKey = useMemo(
    () => Object.fromEntries(roles.map((r) => [r.key, r])),
    [roles],
  );

  // Effective role id for a user: the explicitly-assigned RBAC role, else the
  // system role matching their globalRole tier. Same rule the dropdown shows.
  const currentRoleId = (u: { roleId?: string | null; globalRole: string }) =>
    (u.roleId && rolesById[u.roleId]?.id) ??
    rolesByKey[u.globalRole.toLowerCase()]?.id ??
    "";

  const allUsers = usersQ.data?.data ?? [];
  const shownUsers = memberFilter
    ? allUsers.filter((u) => currentRoleId(u) === memberFilter)
    : allUsers;
  const filterRole = memberFilter ? rolesById[memberFilter] : null;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "roles"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "roles-users"] });
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      editing
        ? api.admin.updateRole(editing.id, {
            name: form.name,
            description: form.description,
            permissions: form.permissions,
          })
        : api.admin.createRole(form),
    onSuccess: () => {
      toast.success(editing ? "Role updated" : "Role created");
      setEditorOpen(false);
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to save role"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.admin.deleteRole(id),
    onSuccess: () => {
      toast.success("Role deleted");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to delete role"),
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, roleId }: { id: string; roleId: string }) =>
      api.admin.setUserRole(id, { roleId }),
    onSuccess: () => {
      toast.success("Role assigned");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to assign role"),
  });

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setEditorOpen(true);
  }
  function openEdit(r: AdminRole) {
    setEditing(r);
    setForm({
      key: r.key,
      name: r.name,
      description: r.description ?? "",
      permissions: r.permissions,
    });
    setEditorOpen(true);
  }
  function togglePerm(p: string) {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(p)
        ? f.permissions.filter((x) => x !== p)
        : [...f.permissions, p],
    }));
  }

  const isWildcard = form.permissions.includes("*");
  // Every role's permissions are editable except the built-in Owner role, which
  // always keeps full access (the API also enforces this).
  const permsLocked = editing?.key === "owner";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & permissions"
        description="Define what staff can access. The admin panel is permission-gated end to end — customers never see it."
        actions={
          <Button onClick={openNew}>
            <Plus className="size-4" /> New role
          </Button>
        }
      />

      {/* Roles list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4" /> Roles
          </CardTitle>
          <CardDescription>
            Tune any role&apos;s permissions, or create custom roles. The Owner
            role always keeps full access.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rolesQ.isLoading ? (
            <div className="p-4">
              <ListSkeleton rows={4} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium">
                        {r.name}
                        {r.isSystem && (
                          <Badge variant="secondary" className="gap-1">
                            <Lock className="size-3" /> system
                          </Badge>
                        )}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {r.key}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.permissions.includes("*")
                        ? "All permissions"
                        : `${r.permissions.length} permission${r.permissions.length === 1 ? "" : "s"}`}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      <button
                        type="button"
                        onClick={() => {
                          setMemberFilter(r.id);
                          setSearch("");
                        }}
                        className="rounded px-1 tabular-nums underline-offset-2 hover:text-foreground hover:underline"
                        title="Show the users who hold this role"
                      >
                        {r._count?.users ?? 0}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEdit(r)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          disabled={r.isSystem || (r._count?.users ?? 0) > 0}
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
          )}
        </CardContent>
      </Card>

      {/* Assign roles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assign roles</CardTitle>
          <CardDescription>
            Give a user any role. Permissions take effect immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {filterRole && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/[0.06] px-3 py-2 text-sm">
              <span>
                Showing the{" "}
                <span className="font-medium">{shownUsers.length}</span> user
                {shownUsers.length === 1 ? "" : "s"} with the{" "}
                <span className="font-medium">{filterRole.name}</span> role.
              </span>
              <button
                type="button"
                onClick={() => setMemberFilter(null)}
                className="text-primary hover:underline"
              >
                Clear
              </button>
            </div>
          )}
          {usersQ.isLoading ? (
            <ListSkeleton rows={5} />
          ) : shownUsers.length ? (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead className="w-64">Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shownUsers.map((u) => {
                    const current =
                      (u.roleId && rolesById[u.roleId]?.id) ??
                      rolesByKey[u.globalRole.toLowerCase()]?.id ??
                      "";
                    return (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="font-medium">
                            {[u.firstName, u.lastName]
                              .filter(Boolean)
                              .join(" ") || u.email}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {u.email}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={current}
                            disabled={assignMutation.isPending}
                            onValueChange={(roleId) =>
                              assignMutation.mutate({ id: u.id, roleId })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              {roles.map((r) => (
                                <SelectItem key={r.id} value={r.id}>
                                  {r.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState
              icon={ShieldCheck}
              title="No users found"
              description="Try another search."
            />
          )}
        </CardContent>
      </Card>

      {/* Role editor dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${editing.name}` : "New role"}
            </DialogTitle>
            <DialogDescription>
              {permsLocked
                ? "The Owner role always has full access — you can rename it, but its permissions can't be reduced."
                : "Toggle the permissions this role grants."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="role-name">Name</Label>
                <Input
                  id="role-name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
              {!editing && (
                <div className="space-y-1.5">
                  <Label htmlFor="role-key">Key</Label>
                  <Input
                    id="role-key"
                    placeholder="billing-manager"
                    value={form.key}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, key: e.target.value }))
                    }
                    className="font-mono"
                  />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-desc">Description</Label>
              <Textarea
                id="role-desc"
                rows={2}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>

            <div className="space-y-3">
              <Label>Permissions</Label>
              {isWildcard ? (
                <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                  This role has the <span className="font-mono">*</span>{" "}
                  wildcard — full access to everything.
                </p>
              ) : (
                <div className="space-y-3">
                  {PERM_GROUPS.map((g) => (
                    <div key={g.title}>
                      <p className="refx-eyebrow mb-1">{g.title}</p>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {g.perms.map((p) => (
                          <label
                            key={p}
                            className={cn(
                              "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm",
                              permsLocked
                                ? "opacity-60"
                                : "cursor-pointer hover:bg-accent/40",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="size-4 accent-primary"
                              disabled={permsLocked}
                              checked={form.permissions.includes(p)}
                              onChange={() => togglePerm(p)}
                            />
                            {permLabel(p)}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={saveMutation.isPending}
              disabled={!form.name.trim() || (!editing && !form.key.trim())}
              onClick={() => saveMutation.mutate()}
            >
              {editing ? "Save changes" : "Create role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              Custom roles can only be deleted when no users are assigned. This
              can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={deleteMutation.isPending}
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.id)
              }
            >
              Delete role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
