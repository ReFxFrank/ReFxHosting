"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ReceiptText, Search, MoreHorizontal, Ban, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/utils";
import type { AdminInvoice, InvoiceState } from "@/lib/types";

const INV_VARIANT: Record<InvoiceState, BadgeProps["variant"]> = {
  DRAFT: "muted",
  OPEN: "warning",
  PAID: "success",
  VOID: "muted",
  UNCOLLECTIBLE: "destructive",
  REFUNDED: "secondary",
};

export default function AdminInvoicesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AdminInvoice | null>(null);
  const canManage = useAuthStore((s) => s.hasPermission("billing.manage"));

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "invoices", search],
    queryFn: () => api.admin.invoices(search ? { q: search } : undefined),
  });
  const invoices = data?.data ?? [];

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "invoices"] });

  const voidMutation = useMutation({
    mutationFn: (id: string) => api.admin.voidInvoice(id),
    onSuccess: () => {
      toast.success("Invoice voided");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to void invoice"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.admin.deleteInvoice(id),
    onSuccess: () => {
      toast.success("Invoice deleted");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to delete invoice"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Every invoice issued across the platform and its payment status."
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by number or customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : invoices.length ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Paid</TableHead>
                  <TableHead className="hidden lg:table-cell">Issued</TableHead>
                  {canManage && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs font-medium">{inv.number}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {inv.user?.email ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={INV_VARIANT[inv.state] ?? "secondary"}>{inv.state}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(inv.totalMinor, inv.currency)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                      {formatMoney(inv.amountPaidMinor, inv.currency)}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {formatDate(inv.createdAt)}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label="Actions">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={inv.state === "PAID" || inv.state === "VOID"}
                              onSelect={() => voidMutation.mutate(inv.id)}
                            >
                              <Ban /> Void / revoke
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem destructive onSelect={() => setDeleteTarget(inv)}>
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
          icon={ReceiptText}
          title="No invoices yet"
          description={search ? "No invoices match your search." : "Issued invoices will appear here."}
        />
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete invoice {deleteTarget?.number}?</DialogTitle>
            <DialogDescription>
              This permanently removes the invoice and its line items/payments. To keep history,
              use Void instead. This can&apos;t be undone.
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
              Delete invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
