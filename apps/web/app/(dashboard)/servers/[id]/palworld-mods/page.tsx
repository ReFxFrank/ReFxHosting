"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PalworldModsCard } from "@/components/server/palworld-mods-card";

export default function PalworldModsPage() {
  const { id } = useParams<{ id: string }>();

  const { data: server, isLoading } = useQuery({
    queryKey: ["server", id],
    queryFn: () => api.servers.get(id),
  });

  const isPalworldWindows = server?.template?.slug === "palworld-windows";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mods"
        description="Install and manage UE4SS server-side mods. Changes apply on the next start."
      />

      {isLoading || !server ? (
        <Skeleton className="h-64 w-full" />
      ) : isPalworldWindows ? (
        <PalworldModsCard server={server} />
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            UE4SS mods are only available on the Palworld (Windows/UE4SS) egg.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
