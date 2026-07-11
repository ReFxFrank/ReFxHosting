/**
 * Upsert the SEO knowledge-base articles (database/seed/kb-articles.ts) into
 * the live database, published. Idempotent — re-running updates bodies in
 * place by slug and never touches articles it doesn't own.
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

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  for (const article of KB_ARTICLES) {
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
  console.log(`Done — ${KB_ARTICLES.length} article(s) published.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
