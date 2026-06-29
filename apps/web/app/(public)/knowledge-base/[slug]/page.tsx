"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Eye } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Markdown } from "@/components/shared/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function KnowledgeBaseArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["kb", "article", slug],
    queryFn: () => api.support.kbArticle(slug),
    retry: (count, err) =>
      !(err instanceof ApiError && err.status === 404) && count < 2,
  });

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-6 h-9 w-2/3" />
        <div className="mt-8 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-24 text-center sm:px-6">
        <BookOpen className="mx-auto size-8 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold">
          {notFound ? "Article not found" : "Couldn't load this article"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {notFound
            ? "It may have been moved or unpublished."
            : "Please try again in a moment."}
        </p>
        <Button asChild className="mt-6">
          <Link href="/knowledge-base">Back to knowledge base</Link>
        </Button>
      </div>
    );
  }

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
      <Link
        href="/knowledge-base"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Knowledge base
      </Link>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {data.category && <Badge variant="secondary">{data.category}</Badge>}
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Eye className="size-3.5" /> {data.views} views
        </span>
      </div>
      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
        {data.title}
      </h1>

      <div className="mt-8">
        <Markdown content={data.body} />
      </div>

      <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/[0.06] pt-6 sm:flex-row sm:items-center">
        <p className="text-sm text-muted-foreground">
          Was this helpful, or still stuck?
        </p>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/knowledge-base">More articles</Link>
          </Button>
          <Button asChild>
            <Link href="/support">Contact support</Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
