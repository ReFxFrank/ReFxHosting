"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CreditCard } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ServerStateBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
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

  // The Mods tab only applies to Minecraft servers that can load mods/plugins
  // (i.e. not Vanilla).
  const slug = server?.template?.slug ?? "";
  const loader = server?.environment?.LOADER;
  const isMinecraft = slug === "minecraft" || slug.startsWith("minecraft-");
  const supportsMods = isMinecraft && loader !== "vanilla";
  const supportsWorkshop = !!server?.template?.supportsWorkshop;
  const isVoice = slug.startsWith("teamspeak");
  // Minecraft/Mods/Modpacks tabs are Minecraft-only; Workshop is Steam-only;
  // Voice is TeamSpeak-only.
  const tabs = serverTabs(id).filter((t) => {
    if (t.href.endsWith("/minecraft")) return isMinecraft;
    if (t.href.endsWith("/mods")) return supportsMods;
    if (t.href.endsWith("/modpacks")) return isMinecraft;
    if (t.href.endsWith("/workshop")) return supportsWorkshop;
    if (t.href.endsWith("/voice")) return isVoice;
    return true;
  });

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
              {server.state === "PENDING_PAYMENT" && (
                <PayNowButton serverId={id} />
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

/** "Pay now" for an AWAITING_PAYMENT server — starts the gateway checkout. */
function PayNowButton({ serverId }: { serverId: string }) {
  const pay = useMutation({
    mutationFn: () => api.billing.payForServer(serverId),
    onSuccess: (res) => {
      if (res?.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      }
      if (res?.paid) {
        toast.success("Payment received — your server is being provisioned.");
        return;
      }
      toast.success("Payment started.");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Could not start payment"),
  });

  return (
    <Button size="sm" loading={pay.isPending} onClick={() => pay.mutate()}>
      <CreditCard className="size-4" /> Pay now
    </Button>
  );
}
