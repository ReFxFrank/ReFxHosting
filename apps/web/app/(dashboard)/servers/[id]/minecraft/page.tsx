"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MinecraftConfigCard } from "@/components/server/minecraft-config-card";

export default function MinecraftPage() {
  const { id } = useParams<{ id: string }>();

  const { data: server, isLoading } = useQuery({
    queryKey: ["server", id],
    queryFn: () => api.servers.get(id),
  });

  const slug = server?.template?.slug ?? "";
  const isMinecraft = slug === "minecraft" || slug.startsWith("minecraft-");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Minecraft"
        description="Pick your loader and version. Changes reinstall the server with your world preserved."
      />

      {isLoading || !server ? (
        <Skeleton className="h-64 w-full" />
      ) : isMinecraft ? (
        <MinecraftConfigCard server={server} />
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            This isn&apos;t a Minecraft server.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
