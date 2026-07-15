"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bug, Send } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import type { BugReport, BugStatus } from "@/lib/types";

const STATUS_LABEL: Record<BugStatus, string> = {
  NEW: "New",
  TRIAGED: "Triaged",
  IN_PROGRESS: "In progress",
  RESOLVED: "Fixed",
  CLOSED: "Closed",
};
const STATUS_VARIANT: Record<BugStatus, BadgeProps["variant"]> = {
  NEW: "secondary",
  TRIAGED: "default",
  IN_PROGRESS: "warning",
  RESOLVED: "success",
  CLOSED: "outline",
};

export default function MyBugsPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["bugs", "mine"],
    queryFn: () => api.bugs.list(),
  });
  const reports = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My bug reports"
        description="Track the bugs you've reported and their status. Use the “Report a bug” button anywhere in the panel to file a new one."
      />

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : reports.length === 0 ? (
        <EmptyState
          icon={Bug}
          title="No bug reports yet"
          description="Spotted something broken? Hit “Report a bug” in the bottom-right corner and we'll take a look."
        />
      ) : (
        <Card>
          <CardContent className="divide-y divide-white/[0.06] p-0">
            {reports.map((r) => (
              <button
                key={r.id}
                onClick={() => setOpenId(r.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  BUG-{r.number}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {r.title}
                </span>
                <Badge variant={STATUS_VARIANT[r.status]}>
                  {STATUS_LABEL[r.status]}
                </Badge>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {openId && (
        <BugDetailDialog id={openId} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

function BugDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const { data: bug, isLoading } = useQuery<BugReport>({
    queryKey: ["bugs", id],
    queryFn: () => api.bugs.get(id),
  });

  const comment = useMutation({
    mutationFn: () => api.bugs.comment(id, reply.trim()),
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["bugs", id] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to add comment"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        {isLoading || !bug ? (
          <ListSkeleton rows={4} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  BUG-{bug.number}
                </span>
                {bug.title}
              </DialogTitle>
              <DialogDescription>
                <Badge variant={STATUS_VARIANT[bug.status]}>
                  {STATUS_LABEL[bug.status]}
                </Badge>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <p className="whitespace-pre-wrap text-muted-foreground">
                {bug.description}
              </p>
              {bug.resolutionNote && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-3">
                  <p className="mb-1 font-medium text-foreground">Resolution</p>
                  {bug.resolutionNote}
                </div>
              )}

              {!!bug.comments?.length && (
                <div className="space-y-2">
                  <p className="font-medium">Updates</p>
                  {bug.comments.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"
                    >
                      <p className="mb-1 text-xs text-muted-foreground">
                        {c.author?.email ?? "You"} ·{" "}
                        {new Date(c.createdAt).toLocaleString()}
                      </p>
                      <p className="whitespace-pre-wrap">{c.body}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <Textarea
                  rows={2}
                  placeholder="Add more detail…"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    loading={comment.isPending}
                    disabled={reply.trim().length === 0}
                    onClick={() => comment.mutate()}
                  >
                    <Send className="size-4" /> Add update
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
