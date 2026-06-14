"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Server as ServerIcon, Search, Plus, Cpu, MemoryStick, HardDrive } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, ServerStateBadge } from "@/components/ui/badge";
import { formatMb } from "@/lib/utils";

export default function ServersPage() {
  const [search, setSearch] = useState("");
  const { data: servers, isLoading } = useQuery({
    queryKey: ["servers"],
    queryFn: () => api.servers.list(),
  });

  const filtered = servers?.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.template?.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.shortId.includes(search),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Servers"
        description="Manage your game servers — console, files, backups and more."
        actions={
          <Button asChild>
            <Link href="/order">
              <Plus className="size-4" /> New server
            </Link>
          </Button>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search servers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : filtered?.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((server) => (
            <Link key={server.id} href={`/servers/${server.id}/console`}>
              <Card className="h-full transition-colors hover:border-primary/40 hover:bg-accent/40">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{server.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {server.template?.name ?? "No game installed"}
                      </p>
                    </div>
                    <ServerStateBadge state={server.state} />
                  </div>

                  {server.primaryAllocation && (
                    <Badge variant="secondary" className="font-mono text-xs">
                      {server.primaryAllocation.ip}:{server.primaryAllocation.port}
                    </Badge>
                  )}

                  <div className="grid grid-cols-3 gap-2 border-t pt-4 text-xs text-muted-foreground">
                    <Spec icon={Cpu} value={`${server.cpuCores} vCPU`} />
                    <Spec icon={MemoryStick} value={formatMb(server.memoryMb)} />
                    <Spec icon={HardDrive} value={formatMb(server.diskMb)} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={ServerIcon}
          title={search ? "No matching servers" : "No servers yet"}
          description={
            search ? "Try a different search term." : "Order your first game server to get started."
          }
          action={
            !search && (
              <Button asChild>
                <Link href="/order">Browse plans</Link>
              </Button>
            )
          }
        />
      )}
    </div>
  );
}

function Spec({ icon: Icon, value }: { icon: React.ComponentType<{ className?: string }>; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="size-3.5" />
      <span>{value}</span>
    </div>
  );
}
