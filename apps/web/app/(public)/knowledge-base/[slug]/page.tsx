import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { Markdown } from "@/components/shared/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SITE_URL, serverGet } from "@/lib/server-api";

/**
 * Server-rendered so crawlers index the full article body — these pages
 * target the exact error messages and setup questions server owners search
 * for, which is the whole point of the knowledge base as a growth channel.
 */

interface KbArticleView {
  slug: string;
  title: string;
  body: string;
  category: string | null;
  views: number;
  createdAt: string;
  updatedAt: string;
}

const fetchArticle = (slug: string) =>
  serverGet<KbArticleView>(`/support/kb/${encodeURIComponent(slug)}`, 300);

/** First markdown paragraph as the meta description (~155 chars). */
function summarize(body: string): string {
  const para = body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#") && !l.startsWith(">") && !l.startsWith("-"));
  const text = (para ?? "").replace(/[*_`[\]()]/g, "");
  return text.length > 155 ? `${text.slice(0, 152)}…` : text;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await fetchArticle(slug);
  if (!article) return { title: "Article not found" };
  const description = summarize(article.body);
  const url = `${SITE_URL}/knowledge-base/${article.slug}`;
  return {
    title: article.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: article.title,
      description,
      url,
      type: "article",
      modifiedTime: article.updatedAt,
    },
  };
}

export default async function KnowledgeBaseArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await fetchArticle(slug);
  if (!article) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: article.title,
    description: summarize(article.body),
    dateCreated: article.createdAt,
    dateModified: article.updatedAt,
    mainEntityOfPage: `${SITE_URL}/knowledge-base/${article.slug}`,
    publisher: {
      "@type": "Organization",
      name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting",
      url: SITE_URL,
    },
  };

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Link
        href="/knowledge-base"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Knowledge base
      </Link>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {article.category && <Badge variant="secondary">{article.category}</Badge>}
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Eye className="size-3.5" /> {article.views} views
        </span>
      </div>
      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
        {article.title}
      </h1>

      <div className="mt-8">
        <Markdown content={article.body} />
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
            <Link href="/order">Host with us instead</Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
