"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ScrollText,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { formatDateTime } from "@/lib/utils";
import type { AuditLog } from "@/lib/types";

export default function AdminAuditPage() {
  const [targetInput, setTargetInput] = useState("");
  const [targetType, setTargetType] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AuditLog | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "audit", targetType, page],
    queryFn: () =>
      api.admin.auditLogs({
        targetType: targetType || undefined,
        page,
      }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Platform-wide trail of administrative and account actions."
      />

      <form
        className="flex max-w-md items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setTargetType(targetInput.trim());
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by target type (e.g. Server, User)…"
            value={targetInput}
            onChange={(e) => setTargetInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {isLoading ? (
        <ListSkeleton rows={8} />
      ) : data?.data?.length ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDateTime(log.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.actor?.email ?? (
                        <span className="text-muted-foreground">system</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{log.action}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{log.targetType}</Badge>
                        {log.targetId && (
                          <span className="truncate font-mono text-xs text-muted-foreground">
                            {log.targetId}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {log.ip ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDetail(log)}
                      >
                        <Eye className="size-4" />
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
          icon={ScrollText}
          title="No audit entries"
          description={
            targetType
              ? "No entries match this target type."
              : "Administrative actions will appear here."
          }
        />
      )}

      {data && data.total > data.perPage && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {data.page} of {totalPages} · {data.total} entries
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

      {/* Metadata detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">{detail?.action}</DialogTitle>
            <DialogDescription>
              {detail && formatDateTime(detail.createdAt)} ·{" "}
              {detail?.actor?.email ?? "system"}
            </DialogDescription>
          </DialogHeader>

          {detail && (
            <div className="space-y-3">
              <dl className="grid grid-cols-3 gap-2 text-sm">
                <dt className="text-muted-foreground">Target type</dt>
                <dd className="col-span-2 font-mono text-xs">{detail.targetType}</dd>
                <dt className="text-muted-foreground">Target ID</dt>
                <dd className="col-span-2 font-mono text-xs">
                  {detail.targetId ?? "—"}
                </dd>
                <dt className="text-muted-foreground">IP</dt>
                <dd className="col-span-2 font-mono text-xs">{detail.ip ?? "—"}</dd>
              </dl>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Metadata</p>
                <pre className="max-h-72 overflow-auto rounded-md border bg-muted/50 p-3 font-mono text-xs">
                  {JSON.stringify(detail.metadata ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDetail(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
