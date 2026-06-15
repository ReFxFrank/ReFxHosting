"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wallet, Search } from "lucide-react";
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
import { formatDateTime, formatMoney } from "@/lib/utils";
import type { PaymentState } from "@/lib/types";

const PAY_VARIANT: Record<PaymentState, BadgeProps["variant"]> = {
  PENDING: "warning",
  SUCCEEDED: "success",
  FAILED: "destructive",
  REFUNDED: "secondary",
};

export default function AdminPaymentsPage() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "payments", search],
    queryFn: () => api.admin.payments(search ? { q: search } : undefined),
  });
  const payments = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="The raw payment ledger — every charge attempt across all gateways. Owner-only."
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by invoice or customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : payments.length ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(p.createdAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {p.invoice?.number ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.invoice?.user?.email ?? "—"}
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">{p.gateway}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={PAY_VARIANT[p.state] ?? "secondary"}>{p.state}</Badge>
                        {p.failureReason && (
                          <span className="hidden max-w-[14rem] truncate text-xs text-muted-foreground lg:inline">
                            {p.failureReason}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(p.amountMinor, p.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={Wallet}
          title="No payments yet"
          description={
            search
              ? "No payments match your search."
              : "Payments will appear here once customers are charged (configure Stripe under Billing)."
          }
        />
      )}
    </div>
  );
}
