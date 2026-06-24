import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 moved CLI configuration out of the schema/package.json into this
 * file (and removed the `--schema` flag). The canonical schema still lives at
 * database/prisma/schema.prisma (shared with the Docker build, which uses the
 * repo root as its context); migrations sit alongside it.
 *
 * The datasource URL stays declared in schema.prisma (`url = env("DATABASE_URL")`)
 * and is resolved at connect time; the runtime connection itself goes through the
 * pg driver adapter in PrismaService. DATABASE_URL is supplied by the environment
 * (docker-compose / the node host / CI), so nothing is loaded here.
 */
export default defineConfig({
  schema: '../../database/prisma/schema.prisma',
  migrations: {
    path: '../../database/prisma/migrations',
  },
  datasource: {
    // Used by Migrate only. Read directly from the environment (not Prisma's
    // strict `env()` helper) with a non-connecting placeholder, so `prisma
    // generate` succeeds in build/CI where DATABASE_URL isn't set; migrate is
    // always run with a real DATABASE_URL.
    url:
      process.env.DATABASE_URL ??
      'postgresql://placeholder:placeholder@localhost:5432/placeholder',
  },
});
