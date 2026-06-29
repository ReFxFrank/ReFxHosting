"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import {
  GameDetailHero,
  GameOrderSummaryPanel,
  GameAbout,
} from "@/components/public/game-detail";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function VoiceDetailPage() {
  const { slug } = useParams<{ slug: string }>();

  const detail = useQuery({
    queryKey: ["storefront", "voice", slug],
    queryFn: () => api.catalog.voiceApp(slug),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });

  if (detail.isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-12 sm:px-6">
        <Skeleton className="h-56 w-full rounded-2xl" />
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-24 text-center sm:px-6">
        <h1 className="text-2xl font-bold">Voice server not available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This voice server isn&apos;t available right now.
        </p>
        <Button asChild className="mt-6">
          <Link href="/voice">Browse voice servers</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="pb-16">
      <GameDetailHero game={detail.data.game} backHref="/voice" backLabel="Voice servers" />
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <GameOrderSummaryPanel detail={detail.data} />
        <GameAbout game={detail.data.game} />
      </div>
    </div>
  );
}
