"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, Send, ShieldAlert } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge, TicketPriorityBadge, TicketStateBadge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { cn, formatDateTime, initials } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import type { TicketMessage } from "@/lib/types";

/** How often the open thread re-checks for new replies / status changes. */
const TICKET_POLL_MS = 15_000;

function authorName(message: TicketMessage) {
  const a = message.author;
  if (!a) return "Unknown";
  const full = [a.firstName, a.lastName].filter(Boolean).join(" ");
  return full || a.email;
}

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [reply, setReply] = useState("");

  const { data: ticket, isLoading } = useQuery({
    queryKey: ["support", "ticket", id],
    queryFn: () => api.support.ticket(id),
    // Keep the open thread live: a reply or status change from the other party
    // shows up without a manual refresh (the global default is
    // refetchOnWindowFocus:false). Polling pauses automatically while the tab is
    // hidden (refetchIntervalInBackground defaults to false), so the focus
    // refetch covers the come-back.
    refetchInterval: TICKET_POLL_MS,
    refetchOnWindowFocus: true,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["support", "ticket", id] });

  const replyMutation = useMutation({
    mutationFn: (body: string) => api.support.reply(id, body),
    onSuccess: () => {
      setReply("");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to send reply"),
  });

  const closeMutation = useMutation({
    mutationFn: () => api.support.closeTicket(id),
    onSuccess: () => {
      toast.success("Ticket closed");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to close ticket"),
  });

  const backLink = (
    <Button variant="ghost" size="sm" asChild>
      <Link href="/support">
        <ArrowLeft className="size-4" /> Back to support
      </Link>
    </Button>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        {backLink}
        <Skeleton className="h-10 w-64" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="space-y-6">
        {backLink}
        <p className="text-sm text-muted-foreground">Ticket not found.</p>
      </div>
    );
  }

  const visibleMessages = ticket.messages ?? [];
  // Staff lock a ticket by closing (or archiving) it — once locked the customer
  // can no longer reply. Only staff can reopen it (from the admin queue).
  const locked = ticket.state === "CLOSED" || ticket.state === "ARCHIVED";

  return (
    <div className="space-y-6">
      {backLink}

      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {ticket.subject}
            <span className="font-mono text-base font-normal text-muted-foreground">
              #{ticket.number}
            </span>
          </span>
        }
        description={
          <span className="flex items-center gap-2 pt-1">
            <TicketStateBadge state={ticket.state} />
            <TicketPriorityBadge priority={ticket.priority} />
          </span>
        }
        actions={
          locked ? undefined : (
            <Button
              variant="outline"
              loading={closeMutation.isPending}
              onClick={() => closeMutation.mutate()}
            >
              <Lock className="size-4" /> Close ticket
            </Button>
          )
        }
      />

      <div className="space-y-4">
        {visibleMessages.map((message) => {
          const mine = !!currentUser && message.authorId === currentUser.id;
          return (
            <div
              key={message.id}
              className={cn("flex gap-3", mine && "flex-row-reverse")}
            >
              <Avatar className="mt-0.5">
                <AvatarFallback>
                  {initials(authorName(message), message.author?.email)}
                </AvatarFallback>
              </Avatar>
              <div className={cn("max-w-[80%] space-y-1", mine && "items-end text-right")}>
                <div
                  className={cn(
                    "flex items-center gap-2 text-xs text-muted-foreground",
                    mine && "flex-row-reverse",
                  )}
                >
                  <span className="font-medium text-foreground">
                    {authorName(message)}
                  </span>
                  {message.author?.globalRole &&
                    message.author.globalRole !== "CUSTOMER" && (
                      <Badge variant="secondary">
                        {message.author.globalRole.toLowerCase()}
                      </Badge>
                    )}
                  {message.isInternal && (
                    <Badge variant="warning">
                      <ShieldAlert className="size-3" /> Internal note
                    </Badge>
                  )}
                  <span>{formatDateTime(message.createdAt)}</span>
                </div>
                <div
                  className={cn(
                    "inline-block whitespace-pre-wrap rounded-xl border px-4 py-2.5 text-left text-sm",
                    mine
                      ? "bg-primary/10 border-primary/20"
                      : message.isInternal
                        ? "bg-warning/5 border-warning/30"
                        : "bg-card",
                  )}
                >
                  {message.body}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          {locked ? (
            <p className="text-sm text-muted-foreground">
              This ticket is closed and can no longer be replied to. Please open a
              new ticket if you still need help.
            </p>
          ) : (
            <>
              <Textarea
                rows={4}
                placeholder="Write a reply…"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              <div className="flex justify-end">
                <Button
                  loading={replyMutation.isPending}
                  disabled={!reply.trim()}
                  onClick={() => replyMutation.mutate(reply.trim())}
                >
                  <Send className="size-4" /> Send reply
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
