/**
 * Upsert the SEO knowledge-base articles (kb-articles.ts + the tutorial
 * batches) into the live database, published. Idempotent — re-running
 * updates bodies in place by slug and never touches articles it doesn't own.
 *
 * Run on the panel machine:
 *   DATABASE_URL=postgresql://... npx tsx database/seed/seed-kb.ts
 * or inside the panel-api container:
 *   docker compose -f infra/docker/docker-compose.yml exec panel-api \
 *     npx tsx database/seed/seed-kb.ts
 */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { KB_ARTICLES } from "./kb-articles";
import { KB_TUTORIALS_A } from "./kb-articles-tutorials-a";
import { KB_TUTORIALS_B } from "./kb-articles-tutorials-b";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const ALL_ARTICLES = [...KB_ARTICLES, ...KB_TUTORIALS_A, ...KB_TUTORIALS_B];

async function main() {
  const seen = new Set<string>();
  for (const article of ALL_ARTICLES) {
    if (seen.has(article.slug)) {
      throw new Error(`duplicate KB slug in seed data: ${article.slug}`);
    }
    seen.add(article.slug);
  }
  for (const article of ALL_ARTICLES) {
    await prisma.kbArticle.upsert({
      where: { slug: article.slug },
      update: {
        title: article.title,
        body: article.body,
        category: article.category,
        isPublished: true,
      },
      create: {
        id: randomUUID(),
        slug: article.slug,
        title: article.title,
        body: article.body,
        category: article.category,
        isPublished: true,
      },
    });
    console.log(`  • upserted ${article.slug}`);
  }
  console.log(`Done — ${ALL_ARTICLES.length} article(s) published.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
