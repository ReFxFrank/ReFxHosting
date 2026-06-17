"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ReceiptText, Search, MoreHorizontal, Ban, Trash2, CheckCircle2 } from "lucide-react";
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const canManage = useAuthStore((s) => s.hasPermission("billing.manage"));

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "invoices", search],
    queryFn: () => api.admin.invoices(search ? { q: search } : undefined),
  });
  const invoices = data?.data ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "invoices"] });
    setSelected(new Set());
  };

  const allSelected = invoices.length > 0 && selected.size === invoices.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(invoices.map((i) => i.id)));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const voidMutation = useMutation({
    mutationFn: (id: string) => api.admin.voidInvoice(id),
    onSuccess: () => {
      toast.success("Invoice voided");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to void invoice"),
  });

  const markPaidMutation = useMutation({
    mutationFn: (id: string) => api.admin.markInvoicePaid(id),
    onSuccess: () => {
      toast.success("Invoice marked paid — server provisioning");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to mark paid"),
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

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.admin.bulkDeleteInvoices(ids),
    onSuccess: (res) => {
      setBulkConfirmOpen(false);
      if (res.deleted.length) {
        toast.success(
          `Deleted ${res.deleted.length} invoice${res.deleted.length === 1 ? "" : "s"}`,
        );
      }
      if (res.skipped.length) {
        toast.error(`${res.skipped.length} skipped — ${res.skipped[0].reason}`);
      }
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to delete invoices"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Every invoice issued across the platform and its payment status."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by number or customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {canManage && selected.size > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{selected.size} selected</span>
            <Button variant="destructive" size="sm" onClick={() => setBulkConfirmOpen(true)}>
              <Trash2 className="size-4" /> Delete selected
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : invoices.length ? (
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
                  <TableRow key={inv.id} data-state={selected.has(inv.id) ? "selected" : undefined}>
                    {canManage && (
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`Select invoice ${inv.number}`}
                          className="size-4 accent-[hsl(var(--primary))]"
                          checked={selected.has(inv.id)}
                          onChange={() => toggle(inv.id)}
                        />
                      </TableCell>
                    )}
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
                              disabled={inv.state !== "OPEN"}
                              onSelect={() => markPaidMutation.mutate(inv.id)}
                            >
                              <CheckCircle2 /> Mark as paid
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={inv.state === "PAID" || inv.state === "VOID"}
                              onSelect={() => voidMutation.mutate(inv.id)}
                            >
                              <Ban /> Void / revoke
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              destructive
                              onSelect={() => setDeleteTarget(inv)}
                            >
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
              This permanently removes the invoice and its line items/payments. This can&apos;t
              be undone.
              {deleteTarget?.state === "PAID" && (
                <span className="mt-2 block font-medium text-warning">
                  This invoice is <strong>paid</strong> — deleting it erases that revenue
                  record. Consider keeping it for your books.
                </span>
              )}
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

      <Dialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selected.size} invoice{selected.size === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              This permanently removes the selected invoices and their line
              items/payments. This can&apos;t be undone.
              {selected.size > 0 &&
                invoices.some((i) => selected.has(i.id) && i.state === "PAID") && (
                  <span className="mt-2 block font-medium text-warning">
                    Some selected invoices are <strong>paid</strong> — deleting them erases
                    those revenue records.
                  </span>
                )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={bulkDeleteMutation.isPending}
              onClick={() => bulkDeleteMutation.mutate(Array.from(selected))}
            >
              Delete selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
