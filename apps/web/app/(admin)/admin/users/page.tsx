"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Users as UsersIcon,
  Search,
  MoreVertical,
  ShieldCheck,
  ShieldOff,
  Ban,
  Eye,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Copy,
  Check,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { formatDate, copyToClipboard } from "@/lib/utils";
import type { GlobalRole, User, UserState } from "@/lib/types";

const stateMeta: Record<UserState, { label: string; variant: BadgeProps["variant"] }> = {
  ACTIVE: { label: "Active", variant: "success" },
  SUSPENDED: { label: "Suspended", variant: "warning" },
  BANNED: { label: "Banned", variant: "destructive" },
  PENDING_VERIFICATION: { label: "Pending", variant: "muted" },
};

const roleMeta: Record<GlobalRole, BadgeProps["variant"]> = {
  CUSTOMER: "secondary",
  SUPPORT: "default",
  ADMIN: "warning",
  OWNER: "destructive",
};

function userName(u: User) {
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ");
  return name || "—";
}

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Confirm dialog for destructive transitions (ban / suspend).
  const [confirm, setConfirm] = useState<{ user: User; state: UserState } | null>(null);

  // Create-user dialog.
  const emptyCreate = { email: "", password: "", firstName: "", lastName: "" };
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "users", search, page],
    // `page` is forwarded as a raw query param by the REST client.
    queryFn: () =>
      api.admin.users({ q: search || undefined, page } as {
        q?: string;
        page?: number;
      }),
  });

  // SUPPORT staff get a read-only list; account actions are ADMIN+.
  const canManage = useAuthStore((s) => s.hasRole("ADMIN"));

  const setStateMutation = useMutation({
    mutationFn: ({ id, state }: { id: string; state: UserState }) =>
      api.admin.setUserState(id, state),
    onSuccess: () => {
      toast.success("User updated");
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setConfirm(null);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to update user"),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.admin.createUser({
        email: createForm.email.trim(),
        password: createForm.password.trim() || undefined,
        firstName: createForm.firstName.trim() || undefined,
        lastName: createForm.lastName.trim() || undefined,
      }),
    onSuccess: (res) => {
      setCreated({ email: res.email, password: res.password });
      setCreateForm(emptyCreate);
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to create user"),
  });

  const closeCreate = () => {
    setCreateOpen(false);
    setCreated(null);
    setCopied(false);
    setCreateForm(emptyCreate);
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Search accounts and manage access state."
        actions={
          canManage ? (
            <Button onClick={() => setCreateOpen(true)}>
              <UserPlus /> Create user
            </Button>
          ) : undefined
        }
      />

      <form
        className="flex max-w-md items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(searchInput.trim());
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by email or name…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : data?.data?.length ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((user) => {
                  const meta = stateMeta[user.state];
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.email}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {userName(user)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={roleMeta[user.globalRole]}>
                          {user.globalRole}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(user.createdAt)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm">
                              <MoreVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/users/${user.id}`}>
                                <Eye /> View account
                              </Link>
                            </DropdownMenuItem>
                            {canManage && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  disabled={user.state === "ACTIVE"}
                                  onSelect={() =>
                                    setStateMutation.mutate({ id: user.id, state: "ACTIVE" })
                                  }
                                >
                                  <ShieldCheck /> Activate
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={user.state === "SUSPENDED"}
                                  onSelect={() => setConfirm({ user, state: "SUSPENDED" })}
                                >
                                  <ShieldOff /> Suspend
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  destructive
                                  disabled={user.state === "BANNED"}
                                  onSelect={() => setConfirm({ user, state: "BANNED" })}
                                >
                                  <Ban /> Ban
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={UsersIcon}
          title="No users found"
          description={
            search
              ? "No accounts match your search."
              : "There are no registered accounts yet."
          }
        />
      )}

      {data && data.total > data.perPage && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {data.page} of {totalPages} · {data.total} users
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-4" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Confirm destructive state change */}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm?.state === "BANNED" ? "Ban user" : "Suspend user"}
            </DialogTitle>
            <DialogDescription>
              {confirm?.state === "BANNED"
                ? "Banning permanently revokes access for "
                : "Suspending temporarily blocks access for "}
              <strong>{confirm?.user.email}</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={setStateMutation.isPending}
              onClick={() =>
                confirm &&
                setStateMutation.mutate({ id: confirm.user.id, state: confirm.state })
              }
            >
              {confirm?.state === "BANNED" ? "Ban user" : "Suspend user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create a new account (e.g. an iOS test/reviewer login) */}
      <Dialog open={createOpen} onOpenChange={(o) => (o ? setCreateOpen(true) : closeCreate())}>
        <DialogContent>
          {created ? (
            <>
              <DialogHeader>
                <DialogTitle>User created</DialogTitle>
                <DialogDescription>
                  Copy the password now — it won&apos;t be shown again. The account is
                  active and email-verified, so it can sign in immediately.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input readOnly value={created.email} className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={created.password} className="font-mono" />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Copy password"
                      onClick={async () => {
                        if (await copyToClipboard(created.password)) {
                          setCopied(true);
                          toast.success("Password copied");
                          setTimeout(() => setCopied(false), 1500);
                        } else {
                          toast.error("Couldn't copy");
                        }
                      }}
                    >
                      {copied ? <Check className="text-success" /> : <Copy />}
                    </Button>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={closeCreate}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Create user</DialogTitle>
                <DialogDescription>
                  Creates an active, email-verified customer account. Leave the password
                  blank to auto-generate a strong one.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cu-email">Email</Label>
                  <Input
                    id="cu-email"
                    type="email"
                    placeholder="reviewer@example.com"
                    value={createForm.email}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, email: e.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="cu-first">First name (optional)</Label>
                    <Input
                      id="cu-first"
                      value={createForm.firstName}
                      onChange={(e) =>
                        setCreateForm((f) => ({ ...f, firstName: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cu-last">Last name (optional)</Label>
                    <Input
                      id="cu-last"
                      value={createForm.lastName}
                      onChange={(e) =>
                        setCreateForm((f) => ({ ...f, lastName: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cu-pass">Password (optional)</Label>
                  <Input
                    id="cu-pass"
                    type="text"
                    placeholder="Leave blank to auto-generate"
                    value={createForm.password}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, password: e.target.value }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    If set: 10+ chars with upper, lower, number &amp; symbol.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={closeCreate}>
                  Cancel
                </Button>
                <Button
                  loading={createMutation.isPending}
                  disabled={!createForm.email.trim()}
                  onClick={() => createMutation.mutate()}
                >
                  Create user
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
