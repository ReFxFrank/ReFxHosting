/**
 * ReFx Hosting — Prisma database seed
 * ---------------------------------------------------------------------------
 * Run via `npx prisma db seed` (configure the `prisma.seed` key in package.json,
 * see README.md) or directly with `ts-node database/seed/seed.ts`.
 *
 * The seed is IDEMPOTENT: it uses upsert on natural unique keys (email, code,
 * slug, fqdn, …) so it can be re-run safely against an existing database.
 *
 * What it creates:
 *   - 1 OWNER user (argon2id-hashed password)
 *   - 1 Region + 1 Node (+ a handful of Allocations)
 *   - Ticket categories with SLA targets
 *   - Game categories
 *   - Products (GAME_SERVER) with multi-currency / multi-interval Prices
 *   - Game templates loaded from ./templates/*.json (+ their TemplateVariables)
 *
 * Conventions (mirroring schema.prisma):
 *   - All primary keys are UUID v7 (time-sortable), generated app-side.
 *   - Money is integer minor units (cents) + ISO currency code.
 *   - Passwords / tokens are stored as argon2id PHC strings.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomFillSync } from 'node:crypto';

import { PrismaClient, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// uuidv7 helper
// ---------------------------------------------------------------------------
// The panel-api depends on `uuid` ^9, which does NOT yet expose `v7`. Rather
// than pull in a new dependency for the seed we implement a small, spec-aligned
// UUID v7 generator (48-bit big-endian Unix-ms timestamp + 74 random bits, with
// the version (0b0111) and RFC 4122 variant (0b10) bits set).
// TODO(impl): once the workspace upgrades to `uuid` >= 10, replace this with
// `import { v7 as uuidv7 } from 'uuid'`.
function uuidv7(): string {
  const bytes = new Uint8Array(16);
  randomFillSync(bytes);

  const ts = Date.now();
  bytes[0] = (ts / 2 ** 40) & 0xff;
  bytes[1] = (ts / 2 ** 32) & 0xff;
  bytes[2] = (ts / 2 ** 24) & 0xff;
  bytes[3] = (ts / 2 ** 16) & 0xff;
  bytes[4] = (ts / 2 ** 8) & 0xff;
  bytes[5] = ts & 0xff;

  // Version 7
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // RFC 4122 variant (10xx)
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB — OWASP minimum for argon2id
  timeCost: 2,
  parallelism: 1,
};

const TEMPLATES_DIR = join(__dirname, 'templates');

/** Shape of a template JSON file in ./templates/*.json */
interface TemplateVariableFile {
  envName: string;
  displayName: string;
  description?: string;
  type: string; // VariableType enum string
  defaultValue?: string | null;
  rules?: Record<string, unknown>;
  userEditable?: boolean;
  userViewable?: boolean;
  sortOrder?: number;
}

interface TemplateFile {
  name: string;
  slug: string;
  author: string;
  description?: string;
  longDescription?: string;
  tags?: string[];
  category?: string; // GameCategory slug
  deployMethods: string[]; // DeployMethod enum strings
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
  variables?: TemplateVariableFile[];
}

// ---------------------------------------------------------------------------
// Seed sections
// ---------------------------------------------------------------------------

async function seedOwner() {
  const email = 'owner@refx.example';
  const password = process.env.SEED_OWNER_PASSWORD || 'ChangeMe!123';

  // Only bootstrap an owner when the platform has NO active owner at all. This
  // is a safety net so a fresh install (or one where every owner was removed)
  // is never locked out — it is NOT a demo account that gets recreated on every
  // deploy. Once you have any active owner (this one kept, or your own), a
  // deleted account stays deleted across rebuilds.
  const existingOwner = await prisma.user.findFirst({
    where: { globalRole: 'OWNER', deletedAt: null },
    select: { id: true, email: true },
  });
  if (existingOwner) {
    console.log(`  • OWNER user: ${existingOwner.email} (exists — not reseeded)`);
    return existingOwner;
  }

  const passwordHash = await argon2.hash(password, ARGON2_OPTS);
  const owner = await prisma.user.create({
    data: {
      id: uuidv7(),
      email,
      passwordHash,
      firstName: 'ReFx',
      lastName: 'Owner',
      globalRole: 'OWNER',
      state: 'ACTIVE',
      emailVerifiedAt: new Date(),
      locale: 'en',
      timezone: 'UTC',
    },
  });

  console.log(`  • OWNER user: ${owner.email} (${owner.id}) — bootstrapped`);
  return owner;
}

// System RBAC roles (mirror apps/panel-api/src/common/permissions.ts).
const SYSTEM_ROLES = [
  { key: 'owner', name: 'Owner', description: 'Full access, including payments and roles.', permissions: ['*'] },
  {
    key: 'admin',
    name: 'Admin',
    description: 'Full management except owner-only financials.',
    permissions: [
      'dashboard.read', 'servers.read', 'servers.manage', 'nodes.read', 'nodes.manage',
      'locations.manage', 'users.read', 'users.manage', 'billing.read', 'billing.manage',
      'catalog.manage', 'content.manage', 'support.read', 'support.manage', 'audit.read', 'settings.manage',
    ],
  },
  { key: 'support', name: 'Support', description: 'Tickets, plus read access to customers and servers.', permissions: ['dashboard.read', 'support.read', 'support.manage', 'users.read', 'servers.read'] },
  { key: 'customer', name: 'Customer', description: 'Client area only — no admin access.', permissions: [] },
];

async function seedRoles() {
  for (const r of SYSTEM_ROLES) {
    await prisma.role.upsert({
      where: { key: r.key },
      update: { name: r.name, description: r.description, permissions: r.permissions, isSystem: true },
      create: {
        id: uuidv7(),
        key: r.key,
        name: r.name,
        description: r.description,
        isSystem: true,
        permissions: r.permissions,
      },
    });
  }
  // Backfill: assign each role-less user the system role matching its globalRole.
  const roles = await prisma.role.findMany({
    where: { isSystem: true },
    select: { id: true, key: true },
  });
  const byKey = Object.fromEntries(roles.map((r) => [r.key, r.id]));
  for (const key of ['owner', 'admin', 'support', 'customer']) {
    await prisma.user.updateMany({
      where: {
        roleId: null,
        globalRole: key.toUpperCase() as Prisma.UserWhereInput['globalRole'],
      },
      data: { roleId: byKey[key] },
    });
  }
  console.log(`  • Roles: ${SYSTEM_ROLES.map((r) => r.key).join(', ')}`);
}

async function seedRegionAndNode() {
  // A few common regions so nodes can be placed/labelled accurately.
  const regions = [
    { code: 'us-east', name: 'US East', country: 'US' },
    { code: 'us-west', name: 'US West', country: 'US' },
    { code: 'eu-central', name: 'EU Central', country: 'DE' },
  ];
  for (const r of regions) {
    await prisma.region.upsert({
      where: { code: r.code },
      update: { name: r.name, country: r.country },
      create: { id: uuidv7(), ...r },
    });
  }
  const region = await prisma.region.findUniqueOrThrow({
    where: { code: 'eu-central' },
  });
  console.log(`  • Regions: ${regions.map((r) => r.code).join(', ')}`);

  // The node bootstrap token would normally be generated and shown once in the
  // panel UI; here we hash a well-known sample so the seed is deterministic.
  // TODO(impl): emit a freshly generated token for real deployments.
  const sampleToken = process.env.SEED_NODE_TOKEN || 'refx_node_sample_bootstrap_token';
  const tokenHash = await argon2.hash(sampleToken, ARGON2_OPTS);

  const node = await prisma.node.upsert({
    where: { fqdn: 'node-fra-01.refx.example' },
    update: {
      state: 'ONLINE',
      os: 'LINUX',
      regionId: region.id,
    },
    create: {
      id: uuidv7(),
      name: 'fra-01',
      fqdn: 'node-fra-01.refx.example',
      regionId: region.id,
      os: 'LINUX',
      state: 'ONLINE',
      maintenance: false,
      agentVersion: '0.1.0',
      tokenHash,
      daemonPort: 8443,
      sftpPort: 2022,
      scheme: 'https',
      cpuCores: 32,
      memoryMb: 131072, // 128 GiB
      diskMb: 4194304, // 4 TiB
      cpuOvercommit: 1.5,
      memOvercommit: 1.0,
    },
  });
  console.log(`  • Node: ${node.fqdn} (${node.id})`);

  // A small block of allocations on the node's public IP. Upsert on the
  // composite unique key (nodeId, ip, port) keeps this idempotent.
  const ip = '203.0.113.10';
  const ports = [25565, 25566, 25567, 28015, 28016, 2456, 2457, 2458];
  for (const port of ports) {
    await prisma.allocation.upsert({
      where: { nodeId_ip_port: { nodeId: node.id, ip, port } },
      update: {},
      create: {
        id: uuidv7(),
        nodeId: node.id,
        ip,
        port,
        isPrimary: false,
      },
    });
  }
  console.log(`  • Allocations: ${ports.length} on ${ip}`);

  return { region, node };
}

async function seedTicketCategories() {
  const categories: Array<{
    name: string;
    slug: string;
    slaFirstResponseMin: number;
    slaResolutionMin: number;
  }> = [
    { name: 'Billing', slug: 'billing', slaFirstResponseMin: 240, slaResolutionMin: 2880 },
    { name: 'Technical', slug: 'technical', slaFirstResponseMin: 120, slaResolutionMin: 1440 },
    { name: 'Abuse', slug: 'abuse', slaFirstResponseMin: 60, slaResolutionMin: 720 },
    { name: 'General', slug: 'general', slaFirstResponseMin: 480, slaResolutionMin: 4320 },
  ];

  for (const c of categories) {
    await prisma.ticketCategory.upsert({
      where: { slug: c.slug },
      update: {
        name: c.name,
        slaFirstResponseMin: c.slaFirstResponseMin,
        slaResolutionMin: c.slaResolutionMin,
      },
      create: { id: uuidv7(), ...c },
    });
  }
  console.log(`  • Ticket categories: ${categories.map((c) => c.name).join(', ')}`);
}

async function seedGameCategories() {
  const categories: Array<{ name: string; slug: string }> = [
    { name: 'Survival', slug: 'survival' },
    { name: 'Modded', slug: 'modded' },
    { name: 'Sandbox', slug: 'sandbox' },
    { name: 'Simulation', slug: 'simulation' },
    { name: 'Roleplay', slug: 'roleplay' },
    { name: 'FPS', slug: 'shooter' },
    { name: 'Voice', slug: 'voice' },
  ];

  const bySlug: Record<string, string> = {};
  for (const c of categories) {
    const row = await prisma.gameCategory.upsert({
      where: { slug: c.slug },
      update: { name: c.name },
      create: { id: uuidv7(), name: c.name, slug: c.slug },
    });
    bySlug[c.slug] = row.id;
  }
  console.log(`  • Game categories: ${categories.map((c) => c.name).join(', ')}`);
  return bySlug;
}

type SeedInterval =
  | 'WEEKLY'
  | 'BIWEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'SEMIANNUAL'
  | 'ANNUAL';

/**
 * Interval price points derived from a monthly base. Short terms are charged
 * proportionally; longer terms discount progressively. Covers all six durations
 * offered on the order page (weekly → annual).
 */
function intervalPrices(monthly: number): Array<[SeedInterval, number]> {
  return [
    ['WEEKLY', Math.max(1, Math.round((monthly * 7) / 30))],
    ['BIWEEKLY', Math.max(1, Math.round((monthly * 14) / 30))],
    ['MONTHLY', monthly],
    ['QUARTERLY', Math.round(monthly * 3 * 0.9)],
    ['SEMIANNUAL', Math.round(monthly * 6 * 0.85)],
    ['ANNUAL', Math.round(monthly * 12 * 0.8)],
  ];
}

/** Idempotently upsert a tier price; never clobbers admin-tuned amounts. */
async function upsertTierPrice(
  productId: string,
  tierId: string,
  interval: SeedInterval,
  amountMinor: number,
) {
  const prismaInterval = interval as Prisma.PriceCreateInput['interval'];
  const existing = await prisma.price.findFirst({
    where: { productId, hardwareTierId: tierId, interval: prismaInterval, currency: 'USD' },
    select: { id: true },
  });
  if (existing) return;
  try {
    await prisma.price.create({
      data: {
        id: uuidv7(),
        productId,
        hardwareTierId: tierId,
        interval: prismaInterval,
        currency: 'USD',
        amountMinor,
        isActive: true,
      },
    });
  } catch (e) {
    // Tolerate a lingering legacy unique constraint or a concurrent insert so a
    // single price hiccup doesn't abort the whole seed (the corrective migration
    // 20260616130000_price_unique_fix removes the offending constraint).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      console.warn(`    ! skipped tier price (${interval}) — unique constraint`);
      return;
    }
    throw e;
  }
}

/**
 * Create a HARDWARE_TIER game Product for each game template with three standard
 * tiers (Low / Mid / High) sized around the template's recommended specs. Mid is
 * marked recommended. Tier resources/prices seed sensible defaults but are fully
 * editable in the admin panel afterwards. Idempotent + create-only on re-seed.
 * Legacy per-loader Minecraft eggs and voice templates are skipped.
 */
async function seedGameTierProducts() {
  const SKIP = new Set([
    'minecraft-paper',
    'minecraft-fabric',
    'minecraft-forge',
    'minecraft-neoforge',
    'teamspeak3', // voice — handled by seedVoiceProducts
  ]);
  const templates = await prisma.gameTemplate.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      recCpuCores: true,
      recMemoryMb: true,
      recDiskMb: true,
      category: { select: { slug: true } },
    },
  });

  let count = 0;
  for (const t of templates) {
    if (SKIP.has(t.slug) || t.category?.slug === 'voice') continue;

    const slug = `gs-${t.slug}`;
    const product = await prisma.product.upsert({
      where: { slug },
      // Don't clobber admin tuning on re-seed; just keep the game link + model.
      update: { gameTemplateId: t.id, type: 'GAME_SERVER', billingModel: 'HARDWARE_TIER', perSlot: false },
      create: {
        id: uuidv7(),
        type: 'GAME_SERVER',
        billingModel: 'HARDWARE_TIER',
        name: t.name,
        slug,
        description: `${t.name} game server hosting — pick a hardware tier.`,
        isActive: true,
        perSlot: false,
        gameTemplateId: t.id,
        allowedTemplateIds: [t.id],
      },
    });

    // Converting a legacy per-slot game product → retire its product-level
    // (per-slot) prices so only tier prices remain active on the storefront.
    // Subscriptions reference prices by id, so deactivating doesn't affect them.
    await prisma.price.updateMany({
      where: { productId: product.id, hardwareTierId: null, isActive: true },
      data: { isActive: false },
    });

    // Tier definitions scaled around the template's recommended specs.
    const tiers: Array<{
      name: string;
      description: string;
      mult: number;
      players: number;
      recommended: boolean;
      sortOrder: number;
    }> = [
      { name: 'Low Tier', description: 'Entry-level — small communities & lightweight servers.', mult: 0.5, players: 10, recommended: false, sortOrder: 0 },
      { name: 'Mid Tier', description: 'Balanced — the recommended default for most servers.', mult: 1, players: 25, recommended: true, sortOrder: 1 },
      { name: 'High Tier', description: 'Premium — large communities & heavy/modded servers.', mult: 2, players: 60, recommended: false, sortOrder: 2 },
    ];

    for (const spec of tiers) {
      const cpuCores = Math.max(1, Math.round(t.recCpuCores * spec.mult * 2) / 2);
      const memoryMb = Math.max(1024, Math.round((t.recMemoryMb * spec.mult) / 512) * 512);
      const diskMb = Math.max(5120, Math.round((t.recDiskMb * spec.mult) / 1024) * 1024);
      // ~$2 per GB RAM per month, floored at $3.
      const monthly = Math.max(300, Math.round((memoryMb / 1024) * 200));

      // Idempotent on (productId, name): reuse the existing tier if present.
      const existing = await prisma.hardwareTier.findFirst({
        where: { productId: product.id, name: spec.name },
        select: { id: true },
      });
      const tier = existing
        ? await prisma.hardwareTier.findUniqueOrThrow({ where: { id: existing.id } })
        : await prisma.hardwareTier.create({
            data: {
              id: uuidv7(),
              productId: product.id,
              name: spec.name,
              description: spec.description,
              cpuCores,
              memoryMb,
              diskMb,
              recommendedPlayers: spec.players,
              isRecommended: spec.recommended,
              isActive: true,
              sortOrder: spec.sortOrder,
            },
          });

      for (const [interval, amountMinor] of intervalPrices(monthly)) {
        await upsertTierPrice(product.id, tier.id, interval, amountMinor);
      }
    }
    count += 1;
  }
  console.log(`  • Game tier products: ${count}`);
}

/**
 * Create a slot-based VOICE_SERVER product for TeamSpeak 3 (the first voice
 * product), bound to the teamspeak3 template. Per-slot pricing/resources;
 * idempotent + create-only on re-seed.
 */
async function seedVoiceProducts() {
  const tpl = await prisma.gameTemplate.findUnique({
    where: { slug: 'teamspeak3' },
    select: { id: true, name: true },
  });
  if (!tpl) {
    console.log('  • Voice products: skipped (teamspeak3 template missing)');
    return;
  }

  const slug = 'voice-teamspeak3';
  const product = await prisma.product.upsert({
    where: { slug },
    update: { gameTemplateId: tpl.id, type: 'VOICE_SERVER', billingModel: 'PER_SLOT', perSlot: true },
    create: {
      id: uuidv7(),
      type: 'VOICE_SERVER',
      billingModel: 'PER_SLOT',
      name: 'TeamSpeak 3',
      slug,
      description: 'TeamSpeak 3 voice hosting — billed per slot. Lightweight, low-latency VoIP.',
      isActive: true,
      perSlot: true,
      gameTemplateId: tpl.id,
      allowedTemplateIds: [tpl.id],
      minSlots: 10,
      maxSlots: 512,
      slotStep: 10,
      // Voice is light: a few MB RAM/slot, negligible CPU/disk.
      cpuPerSlot: 0.01,
      memoryMbPerSlot: 8,
      diskMbPerSlot: 4,
    },
  });

  // ~$0.10 per slot per month, across all six durations (per-slot price).
  for (const [interval, amountMinor] of intervalPrices(10)) {
    const prismaInterval = interval as Prisma.PriceCreateInput['interval'];
    const existing = await prisma.price.findFirst({
      where: { productId: product.id, hardwareTierId: null, interval: prismaInterval, currency: 'USD' },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.price.create({
      data: {
        id: uuidv7(),
        productId: product.id,
        interval: prismaInterval,
        currency: 'USD',
        amountMinor,
        isActive: true,
      },
    });
  }
  console.log('  • Voice products: TeamSpeak 3 (per-slot)');
}

/** Read existing game categories into a { slug: id } map (no writes). */
async function loadGameCategoryMap(): Promise<Record<string, string>> {
  const cats = await prisma.gameCategory.findMany({
    select: { id: true, slug: true },
  });
  return Object.fromEntries(cats.map((c) => [c.slug, c.id]));
}

async function seedTemplates(
  categorySlugToId: Record<string, string>,
  opts: { createOnly?: boolean } = {},
) {
  const files = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.json'));
  let count = 0;

  for (const file of files) {
    const raw = readFileSync(join(TEMPLATES_DIR, file), 'utf8');
    const tpl = JSON.parse(raw) as TemplateFile;

    // Create-only mode (every-deploy egg sync): if a template with this slug
    // already exists, leave it completely untouched — never clobber admin tuning
    // (publish state, art, variables) or re-import on each boot. Only brand-new
    // eggs (new slugs) are added.
    if (opts.createOnly) {
      const existing = await prisma.gameTemplate.findUnique({
        where: { slug: tpl.slug },
        select: { id: true },
      });
      if (existing) continue;
    }

    const categoryId =
      tpl.category && categorySlugToId[tpl.category] ? categorySlugToId[tpl.category] : null;
    if (tpl.category && !categoryId) {
      console.warn(
        `    ! template "${tpl.slug}" references unknown category "${tpl.category}" — leaving uncategorized`,
      );
    }

    const data = {
      categoryId,
      name: tpl.name,
      author: tpl.author,
      description: tpl.description ?? null,
      deployMethods: tpl.deployMethods as Prisma.GameTemplateCreateInput['deployMethods'],
      supportsLinux: tpl.supportsLinux ?? true,
      supportsWindows: tpl.supportsWindows ?? false,
      dockerImages: tpl.dockerImages as Prisma.InputJsonValue,
      steamAppId: tpl.steamAppId ?? null,
      startupCommand: tpl.startupCommand,
      startupDetect: tpl.startupDetect ?? null,
      stopCommand: tpl.stopCommand ?? '^C',
      installScript: tpl.installScript as Prisma.InputJsonValue,
      configFiles: (tpl.configFiles ?? []) as Prisma.InputJsonValue,
      recCpuCores: tpl.recCpuCores ?? 1,
      recMemoryMb: tpl.recMemoryMb ?? 1024,
      recDiskMb: tpl.recDiskMb ?? 5120,
    };

    // Public storefront defaults. Seeded (first-party) templates are published
    // so the storefront has content out of the box. These are applied on CREATE
    // and backfilled onto pre-storefront rows below — but never on plain UPDATE,
    // so admin edits (publish toggles, custom art) made in the panel persist.
    const FEATURED = new Set(['minecraft', 'rust', 'valheim', 'palworld']);
    // Old per-loader Minecraft eggs are superseded by the unified `minecraft`
    // egg (loader chosen per-server). Keep them for existing servers but hide
    // them from the public storefront.
    const DEPRECATED = new Set([
      'minecraft-paper',
      'minecraft-fabric',
      'minecraft-forge',
      'minecraft-neoforge',
    ]);
    // Per-game art (apps/web/public/games/<slug>.svg); the web GameImage falls
    // back to a default placeholder if a file is missing.
    const preset = `/games/${tpl.slug}.svg`;
    const storefront = {
      isPublished: true,
      featured: FEATURED.has(tpl.slug),
      sortOrder: FEATURED.has(tpl.slug) ? 0 : 100,
      longDescription: tpl.longDescription ?? tpl.description ?? null,
      cardImageUrl: preset,
      heroImageUrl: preset,
      tags: tpl.tags ?? (tpl.category ? [tpl.category] : []),
    };

    const template = await prisma.gameTemplate.upsert({
      where: { slug: tpl.slug },
      update: data,
      create: { id: uuidv7(), slug: tpl.slug, ...data, ...storefront },
    });

    // Backfill storefront metadata for rows created before storefront fields
    // existed — only when no card art has ever been set, so we don't clobber
    // any admin customisation.
    if (!template.cardImageUrl) {
      await prisma.gameTemplate.update({
        where: { id: template.id },
        data: storefront,
      });
    } else if (template.cardImageUrl.startsWith('/games/')) {
      // Seed-managed art (bundled /games/* — not an admin custom URL): keep it in
      // sync with the current per-game art + tags so re-seeds reflect taxonomy/art
      // changes without overwriting admin customisation or publish state.
      await prisma.gameTemplate.update({
        where: { id: template.id },
        data: { cardImageUrl: preset, heroImageUrl: preset, tags: storefront.tags },
      });
    }

    // Hide superseded per-loader Minecraft eggs from the public storefront.
    if (DEPRECATED.has(tpl.slug)) {
      await prisma.gameTemplate.update({
        where: { id: template.id },
        data: { isPublished: false },
      });
    }

    // Upsert each variable on the composite unique (templateId, envName).
    for (const v of tpl.variables ?? []) {
      const varData = {
        displayName: v.displayName,
        description: v.description ?? null,
        type: (v.type ?? 'STRING') as Prisma.TemplateVariableCreateInput['type'],
        defaultValue: v.defaultValue ?? null,
        rules: (v.rules ?? {}) as Prisma.InputJsonValue,
        userEditable: v.userEditable ?? true,
        userViewable: v.userViewable ?? true,
        sortOrder: v.sortOrder ?? 0,
      };

      await prisma.templateVariable.upsert({
        where: { templateId_envName: { templateId: template.id, envName: v.envName } },
        update: varData,
        create: { id: uuidv7(), templateId: template.id, envName: v.envName, ...varData },
      });
    }

    count += 1;
    console.log(`    - ${tpl.slug} (${(tpl.variables ?? []).length} vars)`);
  }

  console.log(
    `  • Game templates: ${count} ${opts.createOnly ? 'new egg(s) created' : 'loaded'} from ${TEMPLATES_DIR}`,
  );
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Seeding ReFx Hosting database…');

  // Essential bootstrap — always applied so the platform is operable and the
  // RBAC permission sets stay current. These never resurrect deleted data:
  // seedOwner only creates an owner when none exists, and seedRoles upserts the
  // fixed system roles (which are not user-deletable anyway).
  console.log('Identity:');
  await seedOwner();
  await seedRoles();

  // Demo / sample content (regions, a sample node, ticket categories, game
  // categories, products, templates). This is example data for a fresh install,
  // NOT a managed dataset — re-upserting it on every deploy would resurrect
  // anything an operator deleted. So it only runs when SEED_DEMO is enabled, or
  // automatically on a first run (no regions yet). Set SEED_DEMO=false to keep
  // it off; SEED_DEMO=true to force it.
  const demoFlag = (process.env.SEED_DEMO ?? '').toLowerCase();
  const firstRun = (await prisma.region.count()) === 0;
  const seedDemo =
    demoFlag === 'true' || demoFlag === '1' || (demoFlag === '' && firstRun);

  if (seedDemo) {
    console.log('Infrastructure:');
    await seedRegionAndNode();

    console.log('Support:');
    await seedTicketCategories();

    console.log('Catalog:');
    const categorySlugToId = await seedGameCategories();
    await seedTemplates(categorySlugToId);
  } else {
    console.log(
      'Demo content: skipped (already initialised; set SEED_DEMO=true to force).',
    );

    // Curated game eggs ARE kept in sync every deploy (create-only): brand-new
    // egg JSONs are imported automatically — no SEED_DEMO needed — while existing
    // templates are left untouched. (A hard-deleted egg whose JSON still exists
    // will be re-created; remove its file under database/seed/templates to retire
    // it for good.)
    console.log('Game eggs (auto-load):');
    const categorySlugToId = await loadGameCategoryMap();
    await seedTemplates(categorySlugToId, { createOnly: true });
  }

  // Ensure storefront plans exist for every game template that's present. Runs
  // every deploy (create-only — never clobbers admin tuning and respects
  // deactivation): game templates get a HARDWARE_TIER product with Low/Mid/High
  // tiers; TeamSpeak 3 gets a slot-based VOICE_SERVER product.
  console.log('Storefront plans:');
  // Isolate the two seeders so a hiccup in one (e.g. a lingering constraint on a
  // legacy product) never blocks the other from running.
  try {
    await seedGameTierProducts();
  } catch (e) {
    console.error('  ! game tier products failed:', (e as Error).message);
  }
  try {
    await seedVoiceProducts();
  } catch (e) {
    console.error('  ! voice products failed:', (e as Error).message);
  }

  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
