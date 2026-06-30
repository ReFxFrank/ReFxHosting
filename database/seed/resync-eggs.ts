/**
 * ReFx Hosting — resync game/bot eggs from their JSON onto already-seeded templates
 * ---------------------------------------------------------------------------------
 * Pushes an egg JSON's CODE/spec (startupCommand, startupDetect, dockerImages,
 * installScript, stopCommand, configFiles, deployMethods, kind, recommended specs,
 * + variable defaults) onto an EXISTING GameTemplate — the same fields the seed's
 * every-deploy "create-only" sync touches (database/seed/seed.ts), but as a
 * targeted, previewable, one-shot tool you can run against a single egg without a
 * full reseed cycle.
 *
 * It leaves admin-tunable fields alone (name, description, storefront art/tags,
 * pricing/tiers, publish state) — only the egg's mechanics are resynced.
 *
 * Why this exists beyond the seed: the seed only migrates LIVE server rows off a
 * stale snapshotted startupCommand for ReFx launchers ("bash refx-*"). An egg like
 * the Discord bot ships a `bash -c "..."` wrapper that every server snapshots at
 * create time, so a fix to that wrapper never reaches already-created servers.
 * With --migrate-servers this script also rewrites each live server's snapshotted
 * startupCommand to the egg's new one — but ONLY when the server still carries the
 * egg's PREVIOUS command verbatim (an untouched snapshot), so a customer's edited
 * command is never clobbered.
 *
 * SAFE BY DEFAULT (dry run). Pass --apply to write.
 *
 * Local dev checkout (repo root, deps installed):
 *   npm run db:resync-eggs -- --slug=discord-bot --migrate-servers          # preview
 *   npm run db:resync-eggs -- --slug=discord-bot --migrate-servers --apply  # write
 *
 * In the stack (prod) it runs inside the `migrate` container, the same way the
 * seed does (ts-node + /repo/tsconfig.seed.json — NOT npm). That container bakes
 * in a snapshot of database/seed at build time, so REBUILD it from the latest
 * code first:
 *   git pull
 *   infra/scripts/dc build migrate
 *   # preview:
 *   infra/scripts/dc run --rm --entrypoint sh migrate -c \
 *     "npx ts-node --transpile-only --project /repo/tsconfig.seed.json database/seed/resync-eggs.ts --slug=discord-bot --migrate-servers"
 *   # write:
 *   infra/scripts/dc run --rm --entrypoint sh migrate -c \
 *     "npx ts-node --transpile-only --project /repo/tsconfig.seed.json database/seed/resync-eggs.ts --slug=discord-bot --migrate-servers --apply"
 */
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEMPLATES_DIR = join(__dirname, "templates");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const MIGRATE_SERVERS = args.includes("--migrate-servers");
const ONLY_SLUG = args.find((a) => a.startsWith("--slug="))?.split("=")[1];

interface TemplateVariableFile {
  envName: string;
  displayName: string;
  description?: string;
  type?: string;
  defaultValue?: string | null;
  rules?: Record<string, unknown>;
  userEditable?: boolean;
  userViewable?: boolean;
  sortOrder?: number;
}

interface TemplateFile {
  name: string;
  slug: string;
  category?: string;
  kind?: "GAME" | "WEB" | "BOT";
  deployMethods: string[];
  supportsLinux?: boolean;
  supportsWindows?: boolean;
  dockerImages: Record<string, string>;
  steamAppId?: number | null;
  startupCommand: string;
  startupDetect?: string | null;
  stopCommand?: string;
  installScript: Record<string, unknown>;
  configFiles?: unknown[];
  recCpuCores?: number;
  recMemoryMb?: number;
  recDiskMb?: number;
  supportsWorkshop?: boolean;
  workshopAppId?: number | null;
  variables?: TemplateVariableFile[];
}

async function main(): Promise<void> {
  console.log(
    `\nResync eggs from ${TEMPLATES_DIR}${ONLY_SLUG ? ` · slug=${ONLY_SLUG}` : ""}` +
      `${MIGRATE_SERVERS ? " · migrating live servers" : ""} — ` +
      `${APPLY ? "APPLY (writing)" : "DRY RUN (no changes)"}\n`,
  );

  const categorySlugToId: Record<string, string> = {};
  for (const c of await prisma.gameCategory.findMany({
    select: { id: true, slug: true },
  })) {
    categorySlugToId[c.slug] = c.id;
  }

  const retired = new Set(
    (await prisma.retiredEgg.findMany({ select: { slug: true } })).map(
      (r) => r.slug,
    ),
  );

  const files = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith(".json"));
  let changed = 0;
  let serversMigrated = 0;

  for (const file of files) {
    const tpl = JSON.parse(
      readFileSync(join(TEMPLATES_DIR, file), "utf8"),
    ) as TemplateFile;
    if (ONLY_SLUG && tpl.slug !== ONLY_SLUG) continue;
    if (retired.has(tpl.slug)) {
      console.log(`  ~ ${tpl.slug}: retired in panel — skipped`);
      continue;
    }

    const existing = await prisma.gameTemplate.findUnique({
      where: { slug: tpl.slug },
      select: { id: true, startupCommand: true },
    });
    if (!existing) {
      console.log(
        `  ? ${tpl.slug}: not seeded yet — run the seed to create it`,
      );
      continue;
    }

    const oldCmd = existing.startupCommand;
    const newCmd = tpl.startupCommand;
    const cmdChanged = oldCmd !== newCmd;

    changed++;
    console.log(
      `  • ${tpl.slug}${cmdChanged ? "  (startupCommand changed)" : ""}`,
    );
    if (cmdChanged) {
      console.log(`      startup: ${oldCmd}`);
      console.log(`           ->  ${newCmd}`);
    }

    // Count live servers still carrying the egg's previous command verbatim — the
    // only ones we'll safely migrate (untouched snapshots; never customer edits).
    let migratable = 0;
    if (MIGRATE_SERVERS && cmdChanged) {
      migratable = await prisma.server.count({
        where: {
          templateId: existing.id,
          deletedAt: null,
          startupCommand: oldCmd,
        },
      });
      console.log(
        `      live servers to migrate (untouched snapshot): ${migratable}`,
      );
    }

    if (!APPLY) continue;

    const catId = tpl.category ? categorySlugToId[tpl.category] : undefined;
    await prisma.gameTemplate.update({
      where: { id: existing.id },
      data: {
        ...(catId ? { categoryId: catId } : {}),
        deployMethods:
          tpl.deployMethods as Prisma.GameTemplateUpdateInput["deployMethods"],
        kind: (tpl.kind ?? "GAME") as Prisma.GameTemplateUpdateInput["kind"],
        supportsLinux: tpl.supportsLinux ?? true,
        supportsWindows: tpl.supportsWindows ?? false,
        dockerImages: tpl.dockerImages as Prisma.InputJsonValue,
        steamAppId: tpl.steamAppId ?? null,
        startupCommand: newCmd,
        startupDetect: tpl.startupDetect ?? null,
        stopCommand: tpl.stopCommand ?? "^C",
        installScript: tpl.installScript as Prisma.InputJsonValue,
        configFiles: (tpl.configFiles ?? []) as Prisma.InputJsonValue,
        recCpuCores: tpl.recCpuCores ?? 1,
        recMemoryMb: tpl.recMemoryMb ?? 1024,
        recDiskMb: tpl.recDiskMb ?? 5120,
        supportsWorkshop: tpl.supportsWorkshop ?? false,
        workshopAppId: tpl.workshopAppId ?? null,
      },
    });

    for (const v of tpl.variables ?? []) {
      const varData = {
        displayName: v.displayName,
        description: v.description ?? null,
        type: (v.type ??
          "STRING") as Prisma.TemplateVariableCreateInput["type"],
        defaultValue: v.defaultValue ?? null,
        rules: (v.rules ?? {}) as Prisma.InputJsonValue,
        userEditable: v.userEditable ?? true,
        userViewable: v.userViewable ?? true,
        sortOrder: v.sortOrder ?? 0,
      };
      await prisma.templateVariable.upsert({
        where: {
          templateId_envName: { templateId: existing.id, envName: v.envName },
        },
        update: varData,
        create: {
          id: randomUUID(),
          templateId: existing.id,
          envName: v.envName,
          ...varData,
        },
      });
    }

    if (MIGRATE_SERVERS && cmdChanged && migratable > 0) {
      const res = await prisma.server.updateMany({
        where: {
          templateId: existing.id,
          deletedAt: null,
          startupCommand: oldCmd,
        },
        data: { startupCommand: newCmd },
      });
      serversMigrated += res.count;
      console.log(
        `      migrated ${res.count} live server(s) to the new startup command`,
      );
    }
  }

  console.log(
    `\n${APPLY ? "Applied" : "Would update"} ${changed} egg(s)` +
      (MIGRATE_SERVERS
        ? ` + ${APPLY ? "migrated" : "would migrate"} ${serversMigrated} server(s)`
        : "") +
      (APPLY ? "" : ".  Re-run with --apply to write") +
      ".\n",
  );
}

main()
  .catch((e) => {
    console.error("[resync-eggs] failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
