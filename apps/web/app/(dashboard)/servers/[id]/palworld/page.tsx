"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PalworldSettingsCard } from "@/components/server/palworld-settings-card";

export default function PalworldPage() {
  const { id } = useParams<{ id: string }>();

  const { data: server, isLoading } = useQuery({
    queryKey: ["server", id],
    queryFn: () => api.servers.get(id),
  });

  const isPalworld = server?.template?.slug === "palworld";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Palworld"
        description="Edit PalWorldSettings.ini through a friendly form. Changes apply on the next start — stop the server to edit."
      />

      {isLoading || !server ? (
        <Skeleton className="h-64 w-full" />
      ) : isPalworld ? (
        <PalworldSettingsCard server={server} />
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            This isn&apos;t a Palworld server.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
