"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CreditCard } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { isVoiceServer } from "@/lib/types";
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
  const isPalworld = slug === "palworld";
  const isPalworldWindows = slug === "palworld-windows";
  const supportsMods = isMinecraft && loader !== "vanilla";
  const supportsWorkshop = !!server?.template?.supportsWorkshop;
  const isVoice = isVoiceServer(server);
  const isWeb = server?.serverType === "WEB_APP";
  // Minecraft/Mods/Modpacks tabs are Minecraft-only; Workshop is Steam-only.
  // Voice servers are a separate product line, so the game-oriented sections
  // (console + live compute, switch-game, databases, schedules, upgrade) don't
  // apply and are hidden — leaving Overview, Files, Backups and Settings.
  // Web apps get Domains + the relevant subset (Console for logs, Files, Backups,
  // Settings, Upgrade); the game-specific sections are hidden.
  // Per-server permission gating: a sub-user only sees the tabs their granted
  // permissions cover. Owners and staff receive the full catalog in
  // viewerPermissions, so every tab shows. While the server is still loading
  // (viewerPermissions undefined) we don't filter, to avoid a flicker.
  const viewerPermissions = server?.viewerPermissions;
  const canSeeTab = (perm?: string) =>
    !perm || !viewerPermissions || viewerPermissions.includes(perm);

  const WEB_TABS = ["/console", "/files", "/domains", "/backups", "/settings", "/upgrade"];
  const filtered = serverTabs(id).filter((t) => {
    if (!canSeeTab(t.perm)) return false;
    if (t.href.endsWith("/domains")) return isWeb;
    if (isWeb) return WEB_TABS.some((s) => t.href.endsWith(s));
    if (t.href.endsWith("/minecraft")) return isMinecraft;
    if (t.href.endsWith("/palworld")) return isPalworld;
    if (t.href.endsWith("/palworld-mods")) return isPalworldWindows;
    if (t.href.endsWith("/mods")) return supportsMods;
    if (t.href.endsWith("/modpacks")) return isMinecraft;
    if (t.href.endsWith("/workshop")) return supportsWorkshop;
    if (t.href.endsWith("/voice")) return isVoice;
    if (t.href.endsWith("/console")) return !isVoice;
    if (t.href.endsWith("/switch-game")) return !isVoice;
    if (t.href.endsWith("/databases")) return !isVoice;
    if (t.href.endsWith("/schedules")) return !isVoice;
    if (t.href.endsWith("/upgrade")) return !isVoice;
    return true;
  });

  // For a voice server the Voice page *is* the overview: Console (the usual
  // landing tab) is hidden above, so surface Voice first and label it "Overview".
  const tabs =
    isVoice
      ? (() => {
          const voice = filtered.find((t) => t.href.endsWith("/voice"));
          const rest = filtered.filter((t) => !t.href.endsWith("/voice"));
          return voice ? [{ ...voice, label: "Overview" }, ...rest] : filtered;
        })()
      : filtered;

  // Hard separation: a voice server reached on a game-only section by direct URL
  // / bookmark (e.g. /console, which would otherwise open a console WebSocket) is
  // sent to the voice overview. Rendering the notice instead of {children} also
  // stops that page from ever mounting.
  const router = useRouter();
  const voiceAllowed =
    pathname === `/servers/${id}` ||
    ["/voice", "/files", "/backups", "/settings"].some((s) => pathname.endsWith(s));
  const onGameOnlyPath = !voiceAllowed;
  // A confirmed voice server on a game-only section is redirected to its overview.
  const blockedForVoice = !!server && isVoice && onGameOnlyPath;
  // Until the server is loaded we don't yet know its type, so HOLD rendering of
  // any game-only section — otherwise a voice server would briefly mount it
  // (e.g. the console, which opens a WebSocket) during the cold direct-URL load.
  const holdForLoad = onGameOnlyPath && !server;
  useEffect(() => {
    if (blockedForVoice) router.replace(`/servers/${id}/voice`);
  }, [blockedForVoice, id, router]);

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
                  {server.primaryAllocation.alias || server.primaryAllocation.ip}:{server.primaryAllocation.port}
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

      <div>
        {blockedForVoice ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Redirecting to the voice overview…
          </p>
        ) : holdForLoad ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          children
        )}
      </div>
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
