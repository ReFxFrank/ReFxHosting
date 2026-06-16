"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LifeBuoy, Search, Send, MessageSquareReply, Lock } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { cn, formatDateTime } from "@/lib/utils";
import type {
  CannedResponse,
  StaffMember,
  Ticket,
  TicketMessage,
  TicketPriority,
  TicketState,
} from "@/lib/types";

const STATES: { value: TicketState; label: string }[] = [
  { value: "OPEN", label: "Open" },
  { value: "PENDING_AGENT", label: "Awaiting reply" },
  { value: "PENDING_CUSTOMER", label: "Awaiting customer" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
];

const PRIORITIES: { value: TicketPriority; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const STATE_VARIANT: Record<TicketState, BadgeProps["variant"]> = {
  OPEN: "warning",
  PENDING_AGENT: "warning",
  PENDING_CUSTOMER: "secondary",
  RESOLVED: "success",
  CLOSED: "muted",
};

const PRIORITY_VARIANT: Record<TicketPriority, BadgeProps["variant"]> = {
  LOW: "muted",
  NORMAL: "secondary",
  HIGH: "warning",
  URGENT: "destructive",
};

function stateLabel(s: TicketState) {
  return STATES.find((o) => o.value === s)?.label ?? s;
}
function staffName(s: { firstName: string | null; lastName: string | null; email: string }) {
  return [s.firstName, s.lastName].filter(Boolean).join(" ") || s.email;
}

export default function AdminSupportPage() {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("ALL");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "tickets", search, stateFilter],
    queryFn: () =>
      api.support.tickets({
        q: search || undefined,
        state: stateFilter === "ALL" ? undefined : stateFilter,
      }),
  });
  const tickets = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support tickets"
        description="The full ticket queue. Reply, set priority and status, categorise and assign."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search subjects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All states</SelectItem>
            {STATES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : tickets.length ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Requester</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((t) => (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer"
                    onClick={() => setOpenId(t.id)}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {t.number}
                    </TableCell>
                    <TableCell className="max-w-[18rem] truncate font-medium">
                      {t.subject}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.requester?.email ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATE_VARIANT[t.state]}>{stateLabel(t.state)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={PRIORITY_VARIANT[t.priority]}>{t.priority}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.assignee ? staffName(t.assignee) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">
                      {formatDateTime(t.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={LifeBuoy}
          title="No tickets"
          description={
            search || stateFilter !== "ALL"
              ? "No tickets match your filters."
              : "When customers open tickets they'll appear here."
          }
        />
      )}

      <TicketDrawer ticketId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function TicketDrawer({
  ticketId,
  onClose,
}: {
  ticketId: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const open = !!ticketId;

  const { data: ticket, isLoading } = useQuery({
    queryKey: ["admin", "ticket", ticketId],
    queryFn: () => api.support.ticket(ticketId as string),
    enabled: open,
  });
  const staffQ = useQuery({
    queryKey: ["support", "staff"],
    queryFn: () => api.support.staff(),
    enabled: open,
  });
  const categoriesQ = useQuery({
    queryKey: ["support", "categories"],
    queryFn: () => api.support.categories(),
    enabled: open,
  });
  const cannedQ = useQuery({
    queryKey: ["support", "canned"],
    queryFn: () => api.support.cannedResponses(),
    enabled: open,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "ticket", ticketId] });
    queryClient.invalidateQueries({ queryKey: ["admin", "tickets"] });
  };

  const update = useMutation({
    mutationFn: (input: Parameters<typeof api.support.updateTicket>[1]) =>
      api.support.updateTicket(ticketId as string, input),
    onSuccess: () => {
      toast.success("Ticket updated");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Update failed"),
  });

  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);

  const send = useMutation({
    mutationFn: () => api.support.reply(ticketId as string, reply, internal),
    onSuccess: () => {
      toast.success(internal ? "Note added" : "Reply sent");
      setReply("");
      setInternal(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to send"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        {isLoading || !ticket ? (
          <div className="p-6">
            <ListSkeleton rows={5} />
          </div>
        ) : (
          <>
            <DialogHeader className="border-b p-4">
              <DialogTitle className="flex items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground">#{ticket.number}</span>
                <span className="truncate">{ticket.subject}</span>
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                {ticket.requester
                  ? `${staffName(ticket.requester)} · ${ticket.requester.email}`
                  : ""}
              </p>
            </DialogHeader>

            {/* Workflow controls */}
            <div className="grid gap-3 border-b p-4 sm:grid-cols-4">
              <Control label="Status">
                <Select value={ticket.state} onValueChange={(v) => update.mutate({ state: v as TicketState })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Control>
              <Control label="Priority">
                <Select value={ticket.priority} onValueChange={(v) => update.mutate({ priority: v as TicketPriority })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Control>
              <Control label="Category">
                <Select
                  value={ticket.categoryId ?? "none"}
                  onValueChange={(v) => update.mutate({ categoryId: v === "none" ? null : v })}
                >
                  <SelectTrigger className="h-9"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Uncategorised</SelectItem>
                    {(categoriesQ.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Control>
              <Control label="Assignee">
                <Select
                  value={ticket.assigneeId ?? "none"}
                  onValueChange={(v) => update.mutate({ assigneeId: v === "none" ? null : v })}
                >
                  <SelectTrigger className="h-9"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {(staffQ.data ?? []).map((s: StaffMember) => (
                      <SelectItem key={s.id} value={s.id}>{staffName(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Control>
            </div>

            {/* Conversation */}
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {ticket.messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
            </div>

            {/* Composer */}
            <div className="space-y-2 border-t p-4">
              {(cannedQ.data?.length ?? 0) > 0 && (
                <Select
                  value=""
                  onValueChange={(id) => {
                    const c = cannedQ.data?.find((x: CannedResponse) => x.id === id);
                    if (c) setReply((r) => (r ? `${r}\n\n${c.body}` : c.body));
                  }}
                >
                  <SelectTrigger className="h-8 w-56 text-xs">
                    <MessageSquareReply className="size-3.5" />
                    <SelectValue placeholder="Insert canned response" />
                  </SelectTrigger>
                  <SelectContent>
                    {cannedQ.data?.map((c: CannedResponse) => (
                      <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Textarea
                rows={3}
                placeholder={internal ? "Internal note (hidden from customer)…" : "Write a reply…"}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                className={cn(internal && "border-amber-500/50 bg-amber-500/5")}
              />
              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <Switch checked={internal} onCheckedChange={setInternal} />
                  <Lock className="size-3.5" /> Internal note
                </label>
                <Button
                  loading={send.isPending}
                  disabled={!reply.trim()}
                  onClick={() => send.mutate()}
                >
                  <Send className="size-4" /> {internal ? "Add note" : "Send reply"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function MessageBubble({ message }: { message: TicketMessage }) {
  const author = message.author;
  const isStaff = author?.globalRole && author.globalRole !== "CUSTOMER";
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        message.isInternal
          ? "border-amber-500/40 bg-amber-500/5"
          : isStaff
            ? "border-primary/30 bg-primary/5"
            : "bg-card",
      )}
    >
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {author ? staffName(author) : "Unknown"}
        </span>
        {isStaff && <Badge variant="outline" className="h-4 px-1 text-[10px]">staff</Badge>}
        {message.isInternal && (
          <Badge variant="warning" className="h-4 gap-1 px-1 text-[10px]">
            <Lock className="size-2.5" /> internal
          </Badge>
        )}
        <span className="ml-auto">{formatDateTime(message.createdAt)}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm">{message.body}</p>
    </div>
  );
}
