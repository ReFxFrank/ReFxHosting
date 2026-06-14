"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ServerStateBadge, Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { serverTabs } from "@/components/layout/nav-config";

export default function ServerLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const id = params.id;

  const { data: server } = useQuery({
    queryKey: ["server", id],
    queryFn: () => api.servers.get(id),
    refetchInterval: 15_000,
  });

  const tabs = serverTabs(id);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Link
          href="/servers"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> All servers
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          {server ? (
            <>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{server.name}</h1>
              <ServerStateBadge state={server.state} />
              {server.template && <Badge variant="secondary">{server.template.name}</Badge>}
              {server.primaryAllocation && (
                <Badge variant="outline" className="font-mono">
                  {server.primaryAllocation.ip}:{server.primaryAllocation.port}
                </Badge>
              )}
            </>
          ) : (
            <Skeleton className="h-8 w-64" />
          )}
        </div>
      </div>

      <nav className="-mx-1 flex gap-1 overflow-x-auto border-b">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div>{children}</div>
    </div>
  );
}
