"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ReceiptText, Search } from "lucide-react";
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
import { formatDate, formatMoney } from "@/lib/utils";
import type { InvoiceState } from "@/lib/types";

const INV_VARIANT: Record<InvoiceState, BadgeProps["variant"]> = {
  DRAFT: "muted",
  OPEN: "warning",
  PAID: "success",
  VOID: "muted",
  UNCOLLECTIBLE: "destructive",
  REFUNDED: "secondary",
};

export default function AdminInvoicesPage() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "invoices", search],
    queryFn: () => api.admin.invoices(search ? { q: search } : undefined),
  });
  const invoices = data?.data ?? [];

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
    </div>
  );
}
