"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Users, Search } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/utils";

const STATE_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  ACTIVE: "success",
  SUSPENDED: "warning",
  BANNED: "destructive",
};

export default function AdminCustomersPage() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "customers", search],
    // Paying customers: accounts with an ACTIVE subscription backed by a PAID invoice.
    queryFn: () => api.admin.customers(search ? { q: search } : undefined),
  });

  const customers = useMemo(() => data?.data ?? [], [data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Accounts with an active, paid service. Staff accounts and all users are under Users."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/users">All users</Link>
          </Button>
        }
      />

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
        <ListSkeleton rows={6} />
      ) : customers.length ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Services</TableHead>
                  <TableHead className="hidden md:table-cell">Lifetime spend</TableHead>
                  <TableHead className="hidden lg:table-cell">Joined</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">
                        {[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATE_VARIANT[u.state] ?? "secondary"}>{u.state}</Badge>
                    </TableCell>
                    <TableCell className="hidden tabular-nums sm:table-cell">
                      {u.activeServices}
                      {u.servers ? (
                        <span className="text-xs text-muted-foreground"> · {u.servers} server{u.servers === 1 ? "" : "s"}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden tabular-nums md:table-cell">
                      {formatMoney(u.lifetimeSpendMinor, "USD")}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {formatDate(u.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/users/${u.id}`}>Manage</Link>
                      </Button>
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
          title="No customers found"
          description={search ? "No customers match your search." : "Customer accounts will appear here."}
        />
      )}
    </div>
  );
}
