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

export default function GameDetailPage() {
  const { slug } = useParams<{ slug: string }>();

  const detail = useQuery({
    queryKey: ["storefront", "game", slug],
    queryFn: () => api.catalog.game(slug),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });

  if (detail.isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-12 sm:px-6">
        <Skeleton className="h-56 w-full rounded-2xl" />
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Game unavailable</h1>
        <p className="text-sm text-muted-foreground">
          This game isn&apos;t available right now. Browse the rest of our catalog.
        </p>
        <Button asChild>
          <Link href="/games">Back to games</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <GameDetailHero game={detail.data.game} />
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_340px]">
        <div className="order-2 lg:order-1">
          <GameOrderSummaryPanel detail={detail.data} />
        </div>
        <aside className="order-1 lg:order-2">
          <GameAbout game={detail.data.game} />
        </aside>
      </div>
    </>
  );
}
