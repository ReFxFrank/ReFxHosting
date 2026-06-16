"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShoppingCart, Search, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { useAuthStore } from "@/store/auth";
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
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Deletion is an ADMIN+ action; SUPPORT gets the read-only list.
  const canManage = useAuthStore((s) => s.hasRole("ADMIN"));

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "orders", search],
    queryFn: () => api.admin.orders(search ? { q: search } : undefined),
  });
  const orders = useMemo(() => data?.data ?? [], [data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    setSelected(new Set());
  };

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) =>
      ids.length === 1
        ? api.admin.deleteOrder(ids[0]).then(() => ({ deleted: ids, skipped: [] }))
        : api.admin.bulkDeleteOrders(ids),
    onSuccess: (res) => {
      setConfirmOpen(false);
      if (res.deleted.length) {
        toast.success(
          `Deleted ${res.deleted.length} order${res.deleted.length === 1 ? "" : "s"}`,
        );
      }
      if (res.skipped.length) {
        toast.error(
          `${res.skipped.length} skipped — ${res.skipped[0].reason}`,
        );
      }
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to delete orders"),
  });

  const allSelected = orders.length > 0 && selected.size === orders.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(orders.map((o) => o.id)));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Plan purchases (subscriptions) across the platform — product, customer and status."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by customer or product…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {canManage && selected.size > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{selected.size} selected</span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="size-4" /> Delete selected
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : orders.length ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {canManage && (
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        className="size-4 accent-[hsl(var(--primary))]"
                        checked={allSelected}
                        onChange={toggleAll}
                      />
                    </TableHead>
                  )}
                  <TableHead>Product</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Interval</TableHead>
                  <TableHead className="hidden sm:table-cell">Servers</TableHead>
                  <TableHead className="hidden lg:table-cell">Created</TableHead>
                  {canManage && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id} data-state={selected.has(o.id) ? "selected" : undefined}>
                    {canManage && (
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`Select order ${o.id}`}
                          className="size-4 accent-[hsl(var(--primary))]"
                          checked={selected.has(o.id)}
                          onChange={() => toggle(o.id)}
                        />
                      </TableCell>
                    )}
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
                    {canManage && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          aria-label="Delete order"
                          onClick={() => {
                            setSelected(new Set([o.id]));
                            setConfirmOpen(true);
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    )}
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

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selected.size} order{selected.size === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              This permanently removes the subscription record. Invoice history is kept,
              and orders that still have active servers are skipped — delete those servers
              first.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate(Array.from(selected))}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
