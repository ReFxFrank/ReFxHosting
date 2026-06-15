"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Search, Check, Minus } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";
import type { GlobalRole } from "@/lib/types";

const ROLES: { value: GlobalRole; label: string; blurb: string }[] = [
  { value: "CUSTOMER", label: "Customer", blurb: "Client area only — no staff access." },
  { value: "SUPPORT", label: "Support", blurb: "Read-only staff: overview, customers, servers." },
  { value: "ADMIN", label: "Admin", blurb: "Full management except owner-only financials." },
  { value: "OWNER", label: "Owner", blurb: "Everything, incl. payments & role management." },
];

const ROLE_VARIANT: Record<GlobalRole, BadgeProps["variant"]> = {
  CUSTOMER: "muted",
  SUPPORT: "secondary",
  ADMIN: "default",
  OWNER: "success",
};

// Capability → which roles have it (rank-inclusive: a higher role implies lower).
// Mirrors the server RolesGuard + admin nav gating; this is the reference matrix.
const MATRIX: { area: string; min: GlobalRole; note?: string }[] = [
  { area: "Overview dashboard", min: "SUPPORT" },
  { area: "View customers & users", min: "SUPPORT" },
  { area: "View servers", min: "SUPPORT" },
  { area: "Manage accounts (suspend/ban/delete)", min: "ADMIN" },
  { area: "Nodes & locations", min: "ADMIN" },
  { area: "Orders, invoices & billing", min: "ADMIN" },
  { area: "Products & eggs", min: "ADMIN" },
  { area: "Alerts & homepage notices", min: "ADMIN" },
  { area: "Audit logs & settings", min: "ADMIN" },
  { area: "Payments ledger & gateways", min: "OWNER" },
  { area: "Roles & permissions", min: "OWNER" },
];

const RANK: Record<GlobalRole, number> = { CUSTOMER: 0, SUPPORT: 1, ADMIN: 2, OWNER: 3 };

export default function AdminRolesPage() {
  const queryClient = useQueryClient();
  const isOwner = useAuthStore((s) => s.hasRole("OWNER"));
  const me = useAuthStore((s) => s.user);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "roles-users", search],
    queryFn: () => api.admin.users(search ? { q: search } : undefined),
  });
  const users = data?.data ?? [];

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: GlobalRole }) =>
      api.admin.setUserRole(id, role),
    onSuccess: () => {
      toast.success("Role updated");
      queryClient.invalidateQueries({ queryKey: ["admin", "roles-users"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to set role"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & permissions"
        description="Assign staff roles and review exactly what each role can access. The admin panel is locked to staff roles — customers never see it."
      />

      {/* Permission matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4" /> Permission matrix
          </CardTitle>
          <CardDescription>
            Built-in roles are hierarchical: Owner &gt; Admin &gt; Support &gt; Customer. A
            higher role inherits everything below it.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Capability</TableHead>
                {ROLES.map((r) => (
                  <TableHead key={r.value} className="text-center">
                    {r.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {MATRIX.map((row) => (
                <TableRow key={row.area}>
                  <TableCell className="font-medium">{row.area}</TableCell>
                  {ROLES.map((r) => {
                    const allowed = RANK[r.value] >= RANK[row.min];
                    return (
                      <TableCell key={r.value} className="text-center">
                        {allowed ? (
                          <Check className="mx-auto size-4 text-success" />
                        ) : (
                          <Minus className="mx-auto size-4 text-muted-foreground/40" />
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Role assignment */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assign roles</CardTitle>
          <CardDescription>
            Promote a customer to staff or change a staff member&apos;s role. Owner-only.
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

          {isLoading ? (
            <ListSkeleton rows={5} />
          ) : users.length ? (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Current role</TableHead>
                    <TableHead className="w-56">Set role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const isSelf = u.id === me?.id;
                    return (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="font-medium">
                            {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.email}
                          </div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={ROLE_VARIANT[u.globalRole]}>{u.globalRole}</Badge>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={u.globalRole}
                            disabled={!isOwner || isSelf || roleMutation.isPending}
                            onValueChange={(v) =>
                              roleMutation.mutate({ id: u.id, role: v as GlobalRole })
                            }
                          >
                            <SelectTrigger className={cn(isSelf && "opacity-60")}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLES.map((r) => (
                                <SelectItem key={r.value} value={r.value}>
                                  {r.label}
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
              description={search ? "No users match your search." : "Users will appear here."}
            />
          )}
          {!isOwner && (
            <p className="text-xs text-muted-foreground">
              Only owners can change roles. You can view the permission model above.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
