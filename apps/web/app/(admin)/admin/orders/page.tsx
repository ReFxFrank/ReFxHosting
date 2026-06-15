"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShoppingCart, Search } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import type { SubscriptionState } from "@/lib/types";

const SUB_VARIANT: Record<SubscriptionState, BadgeProps["variant"]> = {
  TRIALING: "secondary",
  ACTIVE: "success",
  PAST_DUE: "warning",
  CANCELED: "muted",
  SUSPENDED: "destructive",
  EXPIRED: "muted",
};

export default function AdminOrdersPage() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "orders", search],
    queryFn: () => api.admin.orders(search ? { q: search } : undefined),
  });
  const orders = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Plan purchases (subscriptions) across the platform — product, customer and status."
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by customer or product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : orders.length ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Interval</TableHead>
                  <TableHead className="hidden sm:table-cell">Servers</TableHead>
                  <TableHead className="hidden lg:table-cell">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.product?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {o.user?.email ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={SUB_VARIANT[o.state] ?? "secondary"}>{o.state}</Badge>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {o.interval}
                    </TableCell>
                    <TableCell className="hidden tabular-nums sm:table-cell">
                      {o._count?.servers ?? 0}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {formatDate(o.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={ShoppingCart}
          title="No orders yet"
          description={search ? "No orders match your search." : "Plan purchases will appear here."}
        />
      )}
    </div>
  );
}
