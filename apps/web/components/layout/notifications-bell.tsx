"use client";

import { useEffect, useRef } from "react";
import { Bell, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";
import { useAuthStore } from "@/store/auth";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Background poll interval for the notifications listener (the "ping"). */
const POLL_MS = 30_000;

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Bell + dropdown notifications panel. Polls the user's notifications in the
 * background; surfaces newly-arrived unread items as a toast ("ping") and an
 * unread-count badge. Items can be marked read or cleared (deleted), one at a
 * time or all at once. Rendered in both the customer and staff top navs.
 */
export function NotificationsBell() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  // IDs already seen as unread — so we only toast genuinely new arrivals.
  const seen = useRef<Set<string> | null>(null);

  const { data: items = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.account.notifications(),
    enabled: !!user,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    const unread = items.filter((n) => !n.readAt);
    if (seen.current === null) {
      // First load: seed the baseline without toasting existing notifications.
      seen.current = new Set(unread.map((n) => n.id));
      return;
    }
    for (const n of unread) {
      if (!seen.current.has(n.id)) toast(n.title, { description: n.body });
    }
    seen.current = new Set(unread.map((n) => n.id));
  }, [items]);

  const unread = items.filter((n) => !n.readAt).length;
  const invalidate = () => qc.invalidateQueries({ queryKey: ["notifications"] });

  const markRead = useMutation({
    mutationFn: (id: string) => api.account.markNotificationRead(id),
    onSuccess: invalidate,
  });
  const markAll = useMutation({
    mutationFn: () => api.account.markAllNotificationsRead(),
    onSuccess: invalidate,
  });
  const clearOne = useMutation({
    mutationFn: (id: string) => api.account.clearNotification(id),
    onSuccess: invalidate,
  });
  const clearAll = useMutation({
    mutationFn: () => api.account.clearAllNotifications(),
    onSuccess: invalidate,
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Notifications"
          className="relative inline-flex size-9 items-center justify-center rounded-full outline-none hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-4 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => markAll.mutate()}
              disabled={!unread}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              Mark all read
            </button>
            <span className="text-muted-foreground/50">·</span>
            <button
              onClick={() => clearAll.mutate()}
              disabled={!items.length}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              Clear all
            </button>
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              You&apos;re all caught up.
            </p>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                className={cn(
                  "group flex items-start gap-2 border-b border-white/[0.04] px-3 py-2 last:border-0",
                  !n.readAt && "bg-white/[0.03]",
                )}
              >
                <button
                  onClick={() => !n.readAt && markRead.mutate(n.id)}
                  className="flex-1 text-left outline-none"
                >
                  <span className="flex items-center gap-2">
                    {!n.readAt && (
                      <span className="size-1.5 shrink-0 rounded-full bg-sky-400" />
                    )}
                    <span className="text-sm font-medium">{n.title}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {n.body}
                  </span>
                  <span className="mt-1 block text-[10px] text-muted-foreground/70">
                    {timeAgo(n.createdAt)}
                  </span>
                </button>
                <button
                  onClick={() => clearOne.mutate(n.id)}
                  aria-label="Clear notification"
                  className="mt-0.5 rounded p-1 text-muted-foreground opacity-0 hover:bg-white/[0.06] hover:text-foreground group-hover:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
