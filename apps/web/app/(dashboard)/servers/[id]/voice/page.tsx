"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic, Copy, KeyRound, Eye, EyeOff, RefreshCw, Users } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";

export default function VoicePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [revealed, setRevealed] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["server", id, "voice"],
    queryFn: () => api.servers.voice(id),
    // Poll while we wait for the server's first boot to write its credentials.
    refetchInterval: (q) => (q.state.data?.ready ? false : 5000),
  });

  const copy = (label: string, value?: string | null) => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Couldn't copy"),
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mic className="size-4" /> TeamSpeak voice server
          </CardTitle>
          <CardDescription>
            Connect in the TeamSpeak client using the address below. Your plan includes
            a fixed number of slots (simultaneous users), enforced automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Connection address">
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-muted px-2 py-1 font-mono text-sm">
                      {data?.address ?? "—"}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Copy address"
                      disabled={!data?.address}
                      onClick={() => copy("Address", data?.address)}
                    >
                      <Copy className="size-4" />
                    </Button>
                  </div>
                </Field>
                <Field label="Slots">
                  <Badge variant="secondary" className="gap-1">
                    <Users className="size-3" /> {data?.slots ?? "—"} clients
                  </Badge>
                </Field>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4" /> Admin access
          </CardTitle>
          <CardDescription>
            Use the <strong>privilege key</strong> to grant yourself Server Admin in the
            TeamSpeak client (Permissions → Use Privilege Key) on first join. The
            ServerQuery admin login below is for advanced remote administration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !data?.ready ? (
            <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-muted-foreground">
              <RefreshCw className="size-4 shrink-0 animate-spin text-warning" />
              <span>
                Waiting for the server&apos;s first boot to generate admin credentials.
                Make sure the server is <strong>started</strong> — this page refreshes
                automatically once they&apos;re ready.
              </span>
            </div>
          ) : (
            <>
              <Field label="Privilege key (token)">
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs">
                    {data.privilegeKey || "Already redeemed"}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Copy privilege key"
                    disabled={!data.privilegeKey}
                    onClick={() => copy("Privilege key", data.privilegeKey)}
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Single-use — once redeemed in the client it stops working (you&apos;ll
                  already have admin).
                </p>
              </Field>

              <div className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">ServerQuery admin</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRevealed((v) => !v)}
                  >
                    {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    {revealed ? "Hide" : "Reveal"}
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Login">
                    <code className="rounded bg-muted px-2 py-1 font-mono text-sm">
                      {data.queryAdmin ?? "serveradmin"}
                    </code>
                  </Field>
                  <Field label="Password">
                    <div className="flex items-center gap-1">
                      <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-sm">
                        {revealed ? data.queryPassword ?? "—" : "••••••••"}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Copy password"
                        disabled={!data.queryPassword}
                        onClick={() => copy("Password", data.queryPassword)}
                      >
                        <Copy className="size-4" />
                      </Button>
                    </div>
                  </Field>
                  <Field label="Query port">
                    <code className="rounded bg-muted px-2 py-1 font-mono text-sm">
                      {data.queryPort}
                    </code>
                  </Field>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => qc.invalidateQueries({ queryKey: ["server", id, "voice"] })}
              >
                <RefreshCw className="size-4" /> Refresh
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
