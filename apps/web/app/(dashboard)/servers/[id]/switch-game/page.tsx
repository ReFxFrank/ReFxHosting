"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Gamepad2,
  Search,
  ArrowRight,
  ShieldAlert,
  Database,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { cn, formatMb } from "@/lib/utils";
import type { GameTemplate } from "@/lib/types";

export default function SwitchGamePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<GameTemplate | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preserveData, setPreserveData] = useState(true);
  const [ack, setAck] = useState(false);

  const { data: server } = useQuery({
    queryKey: ["server", id],
    queryFn: () => api.servers.get(id),
  });

  const { data: templates, isLoading } = useQuery({
    queryKey: ["switchable-templates", id],
    queryFn: () => api.servers.switchableTemplates(id),
  });

  const switchMutation = useMutation({
    mutationFn: () =>
      api.servers.switchGame(id, { templateId: selected!.id, preserveData }),
    onSuccess: () => {
      toast.success("Game switch started. Your server will reinstall the new game.");
      queryClient.invalidateQueries({ queryKey: ["server", id] });
      setConfirmOpen(false);
      router.push(`/servers/${id}/console`);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to start game switch"),
  });

  const filtered = useMemo(
    () =>
      templates?.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.category?.name?.toLowerCase().includes(search.toLowerCase()),
      ),
    [templates, search],
  );

  const currentId = server?.templateId;
  const isVoice = (server?.template?.slug ?? "").startsWith("teamspeak");

  // Voice servers (TeamSpeak) keep their identity for life — game switching
  // doesn't apply. Show a clear message rather than an empty catalog.
  if (isVoice) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Switch game"
          description="Change the installed game while keeping your server, IP, plan and backups."
        />
        <EmptyState
          icon={Gamepad2}
          title="Not available for voice servers"
          description="This is a TeamSpeak voice server. Voice servers keep their identity for the life of the server and can't be switched to a game. Manage it from the Voice tab."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Switch game"
        description="Change the installed game while keeping your server, IP, plan and backups. This is what makes ReFx different."
      />

      {/* From → To preview */}
      <Card className="bg-muted/30">
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <div className="space-y-0.5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Currently running</p>
            <p className="font-semibold">{server?.template?.name ?? "No game installed"}</p>
          </div>
          <ArrowRight className="size-5 text-muted-foreground" />
          <div className="space-y-0.5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Switching to</p>
            <p className={cn("font-semibold", !selected && "text-muted-foreground")}>
              {selected?.name ?? "Select a game below"}
            </p>
          </div>
          {selected && (
            <Button className="ml-auto" onClick={() => setConfirmOpen(true)}>
              Review & switch <ArrowRight className="size-4" />
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search the game catalog…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : filtered?.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((tpl) => {
            const isCurrent = tpl.id === currentId;
            const isSelected = selected?.id === tpl.id;
            const fits =
              !server ||
              (tpl.recMemoryMb <= server.memoryMb && tpl.recDiskMb <= server.diskMb);
            return (
              <button
                key={tpl.id}
                type="button"
                disabled={isCurrent}
                onClick={() => setSelected(tpl)}
                className={cn(
                  "group relative rounded-xl border p-5 text-left transition-all",
                  isSelected
                    ? "border-primary ring-2 ring-primary/30"
                    : "hover:border-primary/40 hover:bg-accent/40",
                  isCurrent && "cursor-not-allowed opacity-60",
                )}
              >
                {isSelected && (
                  <CheckCircle2 className="absolute right-4 top-4 size-5 text-primary" />
                )}
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Gamepad2 className="size-5" />
                </div>
                <div className="mt-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{tpl.name}</p>
                    {isCurrent && <Badge variant="secondary">Current</Badge>}
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {tpl.description ?? `${tpl.category?.name ?? "Game"} server template`}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                  <Badge variant="muted">{tpl.recCpuCores} vCPU rec.</Badge>
                  <Badge variant="muted">{formatMb(tpl.recMemoryMb)} rec.</Badge>
                  {!fits && (
                    <Badge variant="warning">Exceeds your plan — upgrade recommended</Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Gamepad2}
          title="No games available"
          description="Your current plan doesn't allow any alternative game templates. Contact support to expand your catalog."
        />
      )}

      {/* Confirmation dialog with data handling choice */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm game switch</DialogTitle>
            <DialogDescription>
              You&apos;re switching <strong>{server?.name}</strong> from{" "}
              <strong>{server?.template?.name ?? "no game"}</strong> to{" "}
              <strong>{selected?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                preserveData && "border-primary bg-primary/5",
              )}
            >
              <Database className="mt-0.5 size-5 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">Keep existing files</p>
                <p className="text-xs text-muted-foreground">
                  Your current world/data stays on disk. Recommended if you may switch back.
                </p>
              </div>
              <Switch checked={preserveData} onCheckedChange={setPreserveData} />
            </label>

            {!preserveData && (
              <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                <Trash2 className="mt-0.5 size-5 text-destructive" />
                <div className="space-y-2">
                  <p className="text-sm font-medium text-destructive">
                    All current files will be wiped
                  </p>
                  <p className="text-xs text-muted-foreground">
                    A clean install of {selected?.name} will be performed. This cannot be undone.
                    Create a backup first if unsure.
                  </p>
                  <label className="flex items-center gap-2 text-xs">
                    <Switch checked={ack} onCheckedChange={setAck} />
                    I understand my current data will be permanently deleted.
                  </label>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                Your server identity, IP:port, SFTP user, backups and billing plan are preserved.
                The server will be offline briefly while the new game installs.
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={preserveData ? "default" : "destructive"}
              loading={switchMutation.isPending}
              disabled={!preserveData && !ack}
              onClick={() => switchMutation.mutate()}
            >
              Switch to {selected?.name}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
