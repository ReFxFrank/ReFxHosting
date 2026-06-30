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
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { playerCapFor, clampPlayers } from './game-caps';

// Prisma 7 connects via a driver adapter (no bundled engine). DATABASE_URL is
// set by the migrate container at run time.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

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
const KB_DIR = join(__dirname, 'kb');

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
  kind?: 'GAME' | 'WEB' | 'BOT'; // GAME (default), WEB (app container), or BOT (Discord bot)
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
  supportsWorkshop?: boolean;
  workshopAppId?: number | null;
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

/**
 * One resolved sample incident so the public /status page has history on a
 * fresh install. Demo-gated and idempotent (fixed id) — operators can delete it
 * from Admin → Status Incidents. Never a scary "outage": a routine, resolved
 * maintenance window.
 */
async function seedDemoIncidents() {
  const id = '01900000-0000-7000-8000-00000000d001';
  if (await prisma.statusIncident.findUnique({ where: { id } })) {
    console.log('  • Status incidents: sample present');
    return;
  }
  const started = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  const resolved = new Date(started.getTime() + 75 * 60 * 1000);
  await prisma.statusIncident.create({
    data: {
      id,
      title: 'Scheduled network maintenance — CA-East',
      impact: 'MAINTENANCE',
      status: 'RESOLVED',
      components: ['nodes'],
      startedAt: started,
      resolvedAt: resolved,
      updates: {
        create: [
          {
            id: uuidv7(),
            status: 'MONITORING',
            body: 'Maintenance window has started. Brief connectivity blips are possible while we upgrade network links.',
            createdAt: started,
          },
          {
            id: uuidv7(),
            status: 'RESOLVED',
            body: 'Maintenance complete — all nodes healthy and accepting connections.',
            createdAt: resolved,
          },
        ],
      },
    },
  });
  console.log('  • Status incidents: 1 sample (resolved) created');
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
    { name: 'Web Hosting', slug: 'web' },
    { name: 'Bot Hosting', slug: 'bots' },
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
 * Storefront pricing rate: USD **cents per GB of RAM per month**. Every game
 * tier seeds at `tier RAM (GB) × this rate` so adding a game auto-prices
 * sensibly. Derived from node cost × target margin — see docs/25-pricing.md.
 * Override per-deploy with SEED_PRICE_PER_GB_CENTS.
 */
const PRICE_PER_GB_CENTS =
  Number.parseInt(process.env.SEED_PRICE_PER_GB_CENTS ?? '', 10) || 500;

/**
 * Hard ceiling on any single tier's RAM, so the High tier (2× recommended) can't
 * balloon into packages nobody buys. At 14 GB × $5/GB that caps the most expensive
 * plan at **$70/mo** — above this, player-capped games (Palworld 32p, Satisfactory,
 * Enshrouded 16p) literally can't use the memory, and no host sells those packages.
 * The Low/Mid (0.5×/1×) tiers are well under this; it only bites the High tier of
 * the largest eggs (e.g. ARK/Palworld 2×12 GB = 24 GB → capped to 14 GB).
 */
const MAX_TIER_MEMORY_MB = 14336;

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
      kind: true,
      recCpuCores: true,
      recMemoryMb: true,
      recDiskMb: true,
      category: { select: { slug: true } },
      // Variables carry the egg's MAX_PLAYERS rules.max — the game's real player
      // cap, used to clamp the per-tier "~N players" estimate below.
      variables: { select: { envName: true, rules: true } },
    },
  });

  let count = 0;
  for (const t of templates) {
    if (SKIP.has(t.slug) || t.category?.slug === 'voice') continue;

    // WEB templates become WEB_HOSTING products, BOT templates become BOT_HOSTING
    // (Discord/app bot containers), everything else a GAME_SERVER. All three use
    // the same HARDWARE_TIER engine + tier sizing.
    const isWeb = t.kind === 'WEB';
    const isBot = t.kind === 'BOT';
    const pType = isBot ? 'BOT_HOSTING' : isWeb ? 'WEB_HOSTING' : 'GAME_SERVER';
    const slug = `${isBot ? 'bot' : isWeb ? 'web' : 'gs'}-${t.slug}`;
    const product = await prisma.product.upsert({
      where: { slug },
      // Don't clobber admin tuning on re-seed; just keep the link + type/model.
      update: { gameTemplateId: t.id, type: pType, billingModel: 'HARDWARE_TIER', perSlot: false },
      create: {
        id: uuidv7(),
        type: pType,
        billingModel: 'HARDWARE_TIER',
        name: t.name,
        slug,
        description: isBot
          ? `${t.name} hosting — pick a plan, then upload your bot code.`
          : isWeb
            ? `${t.name} web hosting — pick a plan.`
            : `${t.name} game server hosting — pick a hardware tier.`,
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

    // The game's real player ceiling (null = uncapped), used to clamp each
    // tier's "~N players" estimate so e.g. a Palworld High tier doesn't read
    // "~60 players" on a server the game caps at 32.
    const playerCap = playerCapFor(t.slug, t.variables);

    // Tiers: WEB hosting gets storage-forward named plans (Starter→Pro) sized to
    // real website growth stages; games get Low/Mid/High scaled off rec specs.
    const resolved: Array<{
      name: string;
      description: string;
      cpuCores: number;
      memoryMb: number;
      diskMb: number;
      players: number | null;
      recommended: boolean;
      sortOrder: number;
      // Explicit monthly price (cents). Bot tiers set this to bypass the $5/GB
      // rule + $5 floor — Discord bots are tiny, so they're priced to market.
      priceMonthly?: number;
    }> = isBot
      ? [
          { name: 'Micro', description: 'Small bots, testing & development.', cpuCores: 0.5, memoryMb: 256, diskMb: 5120, players: null, recommended: false, sortOrder: 0, priceMonthly: 150 },
          { name: 'Small', description: 'Active bots for small/mid communities.', cpuCores: 1, memoryMb: 512, diskMb: 10240, players: null, recommended: true, sortOrder: 1, priceMonthly: 250 },
          { name: 'Medium', description: 'Bots with a database, caching or many guilds.', cpuCores: 1.5, memoryMb: 1024, diskMb: 15360, players: null, recommended: false, sortOrder: 2, priceMonthly: 450 },
          { name: 'Large', description: 'Heavy bots, or several bots on one instance.', cpuCores: 2, memoryMb: 2048, diskMb: 25600, players: null, recommended: false, sortOrder: 3, priceMonthly: 800 },
        ]
      : isWeb
      ? [
          { name: 'Starter', description: 'Blogs, portfolios & small personal sites.', cpuCores: 1, memoryMb: 1024, diskMb: 10240, players: null, recommended: false, sortOrder: 0 },
          { name: 'Personal', description: 'Growing sites & small businesses.', cpuCores: 1, memoryMb: 2048, diskMb: 25600, players: null, recommended: true, sortOrder: 1 },
          { name: 'Business', description: 'Business sites & light e-commerce (WooCommerce).', cpuCores: 2, memoryMb: 4096, diskMb: 51200, players: null, recommended: false, sortOrder: 2 },
          { name: 'Pro', description: 'High-traffic sites & e-commerce.', cpuCores: 4, memoryMb: 8192, diskMb: 102400, players: null, recommended: false, sortOrder: 3 },
        ]
      : [
          { name: 'Low Tier', description: 'Entry-level — small communities & lightweight servers.', mult: 0.5, players: 10, recommended: false, sortOrder: 0 },
          { name: 'Mid Tier', description: 'Balanced — the recommended default for most servers.', mult: 1, players: 25, recommended: true, sortOrder: 1 },
          { name: 'High Tier', description: 'Premium — large communities & heavy/modded servers.', mult: 2, players: 60, recommended: false, sortOrder: 2 },
        ].map((s) => ({
          name: s.name,
          description: s.description,
          cpuCores: Math.max(1, Math.round(t.recCpuCores * s.mult * 2) / 2),
          memoryMb: Math.min(
            MAX_TIER_MEMORY_MB,
            Math.max(1024, Math.round((t.recMemoryMb * s.mult) / 512) * 512),
          ),
          diskMb: Math.max(5120, Math.round((t.recDiskMb * s.mult) / 1024) * 1024),
          players: clampPlayers(s.players as number | null, playerCap),
          recommended: s.recommended,
          sortOrder: s.sortOrder,
        }));

    for (const spec of resolved) {
      const { cpuCores, memoryMb, diskMb } = spec;
      // Bot tiers carry an explicit price; everything else is tier RAM (GB) ×
      // PRICE_PER_GB_CENTS, floored at $5.
      const monthly =
        spec.priceMonthly ??
        Math.max(500, Math.round((memoryMb / 1024) * PRICE_PER_GB_CENTS));

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

    // Prune tiers no longer in the spec. A template that flipped kind (GAME↔WEB)
    // keeps its old tiers because tier seeding is add-only on (productId, name) —
    // that's what made Web Hosting show stale game Low/Mid/High tiers next to its
    // Starter→Pro plans. Deactivate the strays + their prices (never delete:
    // subscriptions reference price ids) so the storefront shows only this set.
    const desiredNames = resolved.map((r) => r.name);
    const stale = await prisma.hardwareTier.findMany({
      where: { productId: product.id, isActive: true, name: { notIn: desiredNames } },
      select: { id: true },
    });
    if (stale.length) {
      const staleIds = stale.map((s) => s.id);
      await prisma.hardwareTier.updateMany({
        where: { id: { in: staleIds } },
        data: { isActive: false },
      });
      await prisma.price.updateMany({
        where: { hardwareTierId: { in: staleIds } },
        data: { isActive: false },
      });
    }

    // Retire the orphan product left under the other slug scheme when a template
    // flips kind (e.g. a now-WEB template's old `gs-<slug>` GAME_SERVER product).
    // It carries the wrong type + stale tiers; deactivate it so it can't surface.
    const orphanSlug = `${isWeb ? 'gs' : 'web'}-${t.slug}`;
    await prisma.product.updateMany({
      where: { slug: orphanSlug, isActive: true },
      data: { isActive: false },
    });

    count += 1;
  }
  console.log(`  • Game tier products: ${count}`);
}

/**
 * VOICE_SERVER product for TeamSpeak 3, bound to the teamspeak3 template.
 *
 * Pricing is FLAT (HARDWARE_TIER, not per-slot): TeamSpeak is RAM-light, so a
 * simple monthly figure per slot-capacity tier is both inline with the market
 * (official TS Crew/Team/Faction at $4.99/$8.99/$17.99; budget hosts ~$3–7/mo)
 * and far simpler than a per-slot slider. The slot count is carried on each tier
 * as `recommendedPlayers`, which the provisioner injects as TS3SERVER_MAX_CLIENTS.
 *
 * NOTE: 32 slots runs on TeamSpeak's free licence; 64+ slot tiers require an
 * Authorized TeamSpeak Host (ATHP) licence configured on the platform — see
 * docs/OPERATOR-TODO.md. Idempotent + self-healing on re-seed.
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
    // Migrate the original per-slot product to the flat tier model in place
    // (existing subscriptions keep their own price ids and are unaffected).
    update: { gameTemplateId: tpl.id, type: 'VOICE_SERVER', billingModel: 'HARDWARE_TIER', perSlot: false },
    create: {
      id: uuidv7(),
      type: 'VOICE_SERVER',
      billingModel: 'HARDWARE_TIER',
      name: 'TeamSpeak 3',
      slug,
      description: 'TeamSpeak 3 voice hosting — flat monthly plans by slot capacity. Lightweight, low-latency VoIP.',
      isActive: true,
      perSlot: false,
      gameTemplateId: tpl.id,
      allowedTemplateIds: [tpl.id],
    },
  });

  // Retire the legacy per-slot, product-level prices so only flat tier prices are
  // active on the storefront (subscriptions reference price ids, so this is safe).
  await prisma.price.updateMany({
    where: { productId: product.id, hardwareTierId: null, isActive: true },
    data: { isActive: false },
  });

  // Flat slot-capacity tiers. `players` = the TeamSpeak max-client cap (stored as
  // recommendedPlayers → TS3SERVER_MAX_CLIENTS). CPU/RAM/disk stay tiny — voice is
  // light — but are sized so the capacity scheduler still places them sensibly.
  const tiers = [
    { name: 'Community', description: 'Up to 32 slots — ideal for a clan or friend group.', players: 32, monthly: 399, cpuCores: 0.5, memoryMb: 512, diskMb: 1024, recommended: true, sortOrder: 0 },
    { name: 'Plus', description: 'Up to 64 slots — for an active community (licence required).', players: 64, monthly: 699, cpuCores: 1, memoryMb: 768, diskMb: 2048, recommended: false, sortOrder: 1 },
    { name: 'Pro', description: 'Up to 128 slots — large communities & networks (licence required).', players: 128, monthly: 1199, cpuCores: 1, memoryMb: 1024, diskMb: 4096, recommended: false, sortOrder: 2 },
  ];
  const desiredNames = tiers.map((t) => t.name);

  for (const spec of tiers) {
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
            cpuCores: spec.cpuCores,
            memoryMb: spec.memoryMb,
            diskMb: spec.diskMb,
            recommendedPlayers: spec.players,
            isRecommended: spec.recommended,
            isActive: true,
            sortOrder: spec.sortOrder,
          },
        });
    for (const [interval, amountMinor] of intervalPrices(spec.monthly)) {
      await upsertTierPrice(product.id, tier.id, interval, amountMinor);
    }
  }

  // Prune any tiers not in the current set (e.g. left from an earlier scheme).
  const stale = await prisma.hardwareTier.findMany({
    where: { productId: product.id, isActive: true, name: { notIn: desiredNames } },
    select: { id: true },
  });
  if (stale.length) {
    const staleIds = stale.map((s) => s.id);
    await prisma.hardwareTier.updateMany({
      where: { id: { in: staleIds } },
      data: { isActive: false },
    });
    await prisma.price.updateMany({
      where: { hardwareTierId: { in: staleIds } },
      data: { isActive: false },
    });
  }

  console.log('  • Voice products: TeamSpeak 3 (flat slot-capped tiers)');
}

/**
 * Backfill Workshop fields + the Workshop-aware install/startup onto EXISTING
 * templates (the create-only egg sync skips them, so eggs imported before the
 * Workshop feature never got these). Scoped to the workshop fields + install
 * script + startup of templates whose JSON declares `supportsWorkshop`, so it
 * makes the feature work without clobbering unrelated admin tuning (art, publish
 * state, variables). Runs every deploy; idempotent.
 */
/**
 * Servers snapshot their template's startupCommand onto the Server row at
 * creation (and the install spec uses `server.startupCommand ?? template`). So
 * when an egg switches to a ReFx **launcher** (`bash refx-*.sh` — Arma 3, DayZ,
 * TeamSpeak), existing servers keep their old direct command and never run it.
 * For launcher eggs ONLY (marked by the `bash refx-` startup), migrate existing
 * server rows to the launcher. Scoped to launcher eggs so we never clobber a
 * user's custom startup on a normal egg. Idempotent (the NOT clause skips rows
 * already on the launcher).
 */
async function migrateLauncherStartup(templateId: string, startupCommand: string) {
  // Launcher startups are "bash refx-…" or "sh refx-…" (the TS3 egg moved to sh
  // because the Alpine image has no bash). Only migrate launcher commands.
  if (!/^(bash|sh) refx-/.test(startupCommand)) return;
  await prisma.server.updateMany({
    where: {
      templateId,
      deletedAt: null,
      NOT: { startupCommand },
    },
    data: { startupCommand },
  });
}

async function syncWorkshopEggs() {
  const files = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.json'));
  let count = 0;
  for (const file of files) {
    const tpl = JSON.parse(readFileSync(join(TEMPLATES_DIR, file), 'utf8')) as TemplateFile;
    if (!tpl.supportsWorkshop) continue;
    const existing = await prisma.gameTemplate.findUnique({
      where: { slug: tpl.slug },
      select: { id: true },
    });
    if (!existing) continue; // brand-new eggs are created by seedTemplates
    await prisma.gameTemplate.update({
      where: { id: existing.id },
      data: {
        supportsWorkshop: true,
        workshopAppId: tpl.workshopAppId ?? null,
        installScript: tpl.installScript as Prisma.InputJsonValue,
        startupCommand: tpl.startupCommand,
      },
    });
    await migrateLauncherStartup(existing.id, tpl.startupCommand);
    count += 1;
  }
  console.log(`  • Workshop eggs synced: ${count}`);
}

/**
 * Backfill the launcher install script + startup command onto existing voice
 * (TeamSpeak) templates. Like syncWorkshopEggs, this exists because the curated
 * egg sync is create-only, so the slot-enforcing launcher wouldn't reach a
 * TeamSpeak template imported before this feature. Scoped to install
 * script + startup only; idempotent; runs every deploy.
 */
async function syncVoiceEggs() {
  const files = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.json'));
  let count = 0;
  for (const file of files) {
    const tpl = JSON.parse(readFileSync(join(TEMPLATES_DIR, file), 'utf8')) as TemplateFile;
    if (!tpl.slug.startsWith('teamspeak')) continue;
    const existing = await prisma.gameTemplate.findUnique({
      where: { slug: tpl.slug },
      select: { id: true },
    });
    if (!existing) continue; // brand-new eggs are created by seedTemplates
    await prisma.gameTemplate.update({
      where: { id: existing.id },
      data: {
        installScript: tpl.installScript as Prisma.InputJsonValue,
        startupCommand: tpl.startupCommand,
      },
    });
    await migrateLauncherStartup(existing.id, tpl.startupCommand);
    count += 1;
  }
  console.log(`  • Voice eggs synced: ${count}`);
}

/**
 * The TeamSpeak image entrypoint refuses to run unless TS3SERVER_LICENSE=accept.
 * Backfill it onto existing teamspeak servers (a brief window defaulted it to "")
 * so they boot again; the customer's actual license acceptance is gated
 * separately by the panel (REFX_TS3_LICENSE_ACCEPTED). Takes effect on the
 * server's next (re)install, which re-pushes the env to the agent.
 */
async function fixTeamspeakLicenseEnv() {
  const tpl = await prisma.gameTemplate.findUnique({
    where: { slug: 'teamspeak3' },
    select: { id: true },
  });
  if (!tpl) return;
  const servers = await prisma.server.findMany({
    where: { templateId: tpl.id, deletedAt: null },
    select: { id: true, environment: true },
  });
  let fixed = 0;
  for (const s of servers) {
    const env = (s.environment ?? {}) as Record<string, unknown>;
    if (env.TS3SERVER_LICENSE === 'accept') continue;
    await prisma.server.update({
      where: { id: s.id },
      data: {
        environment: { ...env, TS3SERVER_LICENSE: 'accept' } as Prisma.InputJsonObject,
      },
    });
    fixed += 1;
  }
  if (fixed) console.log(`  • TeamSpeak license env fixed on ${fixed} server(s)`);
}

/**
 * One-time rename of the web-hosting egg + its product. The create-only egg sync
 * deliberately preserves the admin-tunable name/description, so renaming it in the
 * egg JSON never reaches an already-seeded template. Apply it once, only while it
 * still carries the original name, so a later admin rename is never clobbered.
 */
async function renameWebHostingEgg() {
  const tpl = await prisma.gameTemplate.findUnique({
    where: { slug: 'static-nginx' },
    select: { id: true, name: true },
  });
  if (!tpl || tpl.name !== 'Static Website (nginx)') return;
  await prisma.gameTemplate.update({
    where: { id: tpl.id },
    data: {
      name: 'Web Hosting',
      description:
        'Host your website — upload your files and go, with a managed container, SFTP, and automatic SSL on your own domain.',
      longDescription:
        'Managed web hosting on a dedicated container. Upload your site (HTML/CSS/JS) to the public/ folder over SFTP or the file manager and it goes live instantly; map your own domain and we issue + renew SSL automatically. Pick a plan that fits your traffic.',
    },
  });
  await prisma.product.updateMany({
    where: { gameTemplateId: tpl.id, name: 'Static Website (nginx)' },
    data: { name: 'Web Hosting' },
  });
  console.log('  • renamed web-hosting egg → "Web Hosting"');
}

/**
 * Backfill the unified `minecraft` egg's install script + default startup onto an
 * existing template (the curated egg seed is create-only). This is how install
 * hardening — e.g. the per-loader launch-artifact verification — reaches a
 * Minecraft template imported before the change. Template fields only; a server's
 * per-loader startup command (set when its loader is chosen) is left untouched.
 */
async function syncMinecraftEgg() {
  const existing = await prisma.gameTemplate.findUnique({
    where: { slug: 'minecraft' },
    select: { id: true },
  });
  if (!existing) return; // a brand-new install is created by seedTemplates
  const tpl = JSON.parse(
    readFileSync(join(TEMPLATES_DIR, 'minecraft.json'), 'utf8'),
  ) as TemplateFile;
  await prisma.gameTemplate.update({
    where: { id: existing.id },
    data: {
      installScript: tpl.installScript as Prisma.InputJsonValue,
      startupCommand: tpl.startupCommand,
    },
  });
  console.log('  • Minecraft egg synced');
}

/**
 * One-time cleanup: the per-server *customer* Steam login was removed in favour
 * of the host game-download account (Workshop mods download via the admin
 * account). Null out any legacy stored credentials so no unused Steam secrets
 * linger at rest. Idempotent — only touches rows that still have them.
 */
async function clearLegacySteamLogins() {
  const res = await prisma.server.updateMany({
    where: {
      OR: [
        { steamUsername: { not: null } },
        { steamPasswordEnc: { not: null } },
        { steamGuardCode: { not: null } },
      ],
    },
    data: { steamUsername: null, steamPasswordEnc: null, steamGuardCode: null },
  });
  if (res.count) {
    console.log(`  • Cleared legacy per-server Steam logins: ${res.count}`);
  }
}

/** Shape of a knowledge-base article in ./kb/articles.json */
interface KbArticleFile {
  slug: string;
  title: string;
  category?: string | null;
  body: string;
}

/**
 * Seed the customer-facing knowledge base from ./kb/articles.json. CREATE-ONLY
 * and idempotent: an article is created (published) only if its slug doesn't
 * already exist, so staff edits in the panel are never clobbered on re-seed.
 * New articles added to the JSON are imported automatically on the next deploy.
 */
async function seedKbArticles(): Promise<void> {
  let raw: string;
  try {
    raw = readFileSync(join(KB_DIR, 'articles.json'), 'utf8');
  } catch {
    console.log('  • Knowledge base: skipped (no kb/articles.json)');
    return;
  }
  const articles = JSON.parse(raw) as KbArticleFile[];
  let created = 0;
  for (const a of articles) {
    if (!a.slug || !a.title || !a.body) continue;
    const existing = await prisma.kbArticle.findUnique({
      where: { slug: a.slug },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.kbArticle.create({
      data: {
        id: uuidv7(),
        slug: a.slug,
        title: a.title,
        body: a.body,
        category: a.category ?? null,
        isPublished: true,
      },
    });
    created += 1;
  }
  console.log(
    `  • Knowledge base: ${created} new article(s) created (${articles.length} in catalog)`,
  );
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

  // Eggs an admin deleted in the panel are tombstoned (RetiredEgg) so this
  // every-deploy import never resurrects them from their JSON file.
  const retired = new Set(
    (await prisma.retiredEgg.findMany({ select: { slug: true } })).map(
      (r) => r.slug,
    ),
  );

  for (const file of files) {
    const raw = readFileSync(join(TEMPLATES_DIR, file), 'utf8');
    const tpl = JSON.parse(raw) as TemplateFile;

    // Skip eggs an admin retired in the panel — leave them deleted across reseeds.
    if (retired.has(tpl.slug)) continue;

    // Create-only mode (every-deploy egg sync): for an EXISTING template, push the
    // egg's CODE/spec fixes (install, startup, images, detect/stop, config files,
    // steam id, recommended specs) + variables so bug-fixes reach already-seeded
    // games without a manual re-import — but leave admin-tunable fields alone:
    // storefront (publish/art/tags), pricing/tiers, and the name/description.
    if (opts.createOnly) {
      const existing = await prisma.gameTemplate.findUnique({
        where: { slug: tpl.slug },
        select: { id: true },
      });
      if (existing) {
        const catId =
          tpl.category && categorySlugToId[tpl.category]
            ? categorySlugToId[tpl.category]
            : undefined;
        await prisma.gameTemplate.update({
          where: { id: existing.id },
          data: {
            ...(catId ? { categoryId: catId } : {}),
            deployMethods:
              tpl.deployMethods as Prisma.GameTemplateUpdateInput['deployMethods'],
            kind: (tpl.kind ?? 'GAME') as Prisma.GameTemplateUpdateInput['kind'],
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
            supportsWorkshop: tpl.supportsWorkshop ?? false,
            workshopAppId: tpl.workshopAppId ?? null,
          },
        });
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
            where: {
              templateId_envName: { templateId: existing.id, envName: v.envName },
            },
            update: varData,
            create: {
              id: uuidv7(),
              templateId: existing.id,
              envName: v.envName,
              ...varData,
            },
          });
        }
        // When a plain egg switches to a ReFx launcher (`bash refx-*.sh` — e.g.
        // Rust gaining refx-rust.sh), migrate existing server rows off their
        // snapshotted direct command, same as the workshop/voice syncs do. Without
        // this the template flips but live servers keep running the old command.
        await migrateLauncherStartup(existing.id, tpl.startupCommand);
        continue;
      }
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
      kind: (tpl.kind ?? 'GAME') as Prisma.GameTemplateCreateInput['kind'],
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
      supportsWorkshop: tpl.supportsWorkshop ?? false,
      workshopAppId: tpl.workshopAppId ?? null,
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

    console.log('Status:');
    await seedDemoIncidents();
  } else {
    console.log(
      'Demo content: skipped (already initialised; set SEED_DEMO=true to force).',
    );

    // Curated game eggs ARE kept in sync every deploy (create-only): brand-new
    // egg JSONs are imported automatically — no SEED_DEMO needed — while existing
    // templates are left untouched. Eggs an admin DELETES in the panel are
    // tombstoned (RetiredEgg) and skipped here, so they stay gone across reseeds
    // without touching the JSON files.
    console.log('Game eggs (auto-load):');
    // Ensure categories exist (upsert) even on a create-only reseed — loading the
    // map alone meant a newly-added category (e.g. voice/web) never got created, so
    // templates referencing it kept a NULL categoryId and never moved out of Games.
    const categorySlugToId = await seedGameCategories();
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

  // Knowledge base: import any new articles from kb/articles.json (create-only).
  console.log('Knowledge base:');
  try {
    await seedKbArticles();
  } catch (e) {
    console.error('  ! knowledge base seed failed:', (e as Error).message);
  }

  // Curated egg sync is create-only (to preserve admin tuning), so Workshop
  // flags + the Workshop-aware install scripts wouldn't reach eggs imported
  // before this feature. Backfill those specific fields for Workshop eggs every
  // deploy so the Workshop tab + steamcmd download work on existing templates.
  try {
    await syncWorkshopEggs();
  } catch (e) {
    console.error('  ! workshop egg sync failed:', (e as Error).message);
  }

  // Same rationale for voice (TeamSpeak): backfill the slot-enforcing launcher
  // onto templates imported before this feature.
  try {
    await syncVoiceEggs();
  } catch (e) {
    console.error('  ! voice egg sync failed:', (e as Error).message);
  }

  // Ensure existing TeamSpeak servers keep TS3SERVER_LICENSE=accept so the image
  // entrypoint runs (a brief egg change defaulted it to "" and broke booting).
  try {
    await fixTeamspeakLicenseEnv();
  } catch (e) {
    console.error('  ! teamspeak license env fix failed:', (e as Error).message);
  }

  // One-time rename of the web-hosting egg (create-only sync preserves names).
  try {
    await renameWebHostingEgg();
  } catch (e) {
    console.error('  ! web-hosting egg rename failed:', (e as Error).message);
  }

  // Backfill the hardened unified Minecraft install script (per-loader launch
  // verification, etc.) onto an existing `minecraft` template. Template-only —
  // each server's per-loader startup command is managed separately and untouched.
  try {
    await syncMinecraftEgg();
  } catch (e) {
    console.error('  ! minecraft egg sync failed:', (e as Error).message);
  }

  try {
    await clearLegacySteamLogins();
  } catch (e) {
    console.error('  ! legacy steam-login cleanup failed:', (e as Error).message);
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
