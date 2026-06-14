"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Users as UsersIcon,
  Search,
  MoreVertical,
  ShieldCheck,
  ShieldOff,
  Ban,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { formatDate } from "@/lib/utils";
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

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "users", search, page],
    // `page` is forwarded as a raw query param by the REST client.
    queryFn: () =>
      api.admin.users({ search: search || undefined, page } as {
        search?: string;
        page?: number;
      }),
  });

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

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Search accounts and manage access state."
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
    </div>
  );
}
