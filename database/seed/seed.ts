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

async function seedProducts() {
  // Each product carries a resource template + a price matrix. Prices are in
  // integer minor units (cents). USD is the primary currency; a couple of
  // products also advertise EUR.
  interface PriceSpec {
    interval: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
    currency: string;
    amountMinor: number;
  }
  interface ProductSpec {
    name: string;
    slug: string;
    description: string;
    cpuCores: number;
    memoryMb: number;
    diskMb: number;
    slots: number | null;
    prices: PriceSpec[];
  }

  const products: ProductSpec[] = [
    {
      name: 'Game Server — Starter',
      slug: 'game-server-starter',
      description: '2 vCPU, 4 GB RAM, 25 GB NVMe. Great for small Minecraft / Valheim groups.',
      cpuCores: 2,
      memoryMb: 4096,
      diskMb: 25600,
      slots: 12,
      prices: [
        { interval: 'MONTHLY', currency: 'USD', amountMinor: 999 },
        { interval: 'QUARTERLY', currency: 'USD', amountMinor: 2697 },
        { interval: 'ANNUAL', currency: 'USD', amountMinor: 9590 },
        { interval: 'MONTHLY', currency: 'EUR', amountMinor: 899 },
      ],
    },
    {
      name: 'Game Server — Standard',
      slug: 'game-server-standard',
      description: '4 vCPU, 8 GB RAM, 50 GB NVMe. Modded servers and mid-size communities.',
      cpuCores: 4,
      memoryMb: 8192,
      diskMb: 51200,
      slots: 32,
      prices: [
        { interval: 'MONTHLY', currency: 'USD', amountMinor: 1999 },
        { interval: 'QUARTERLY', currency: 'USD', amountMinor: 5397 },
        { interval: 'ANNUAL', currency: 'USD', amountMinor: 19190 },
        { interval: 'MONTHLY', currency: 'EUR', amountMinor: 1799 },
      ],
    },
    {
      name: 'Game Server — Performance',
      slug: 'game-server-performance',
      description: '8 vCPU, 16 GB RAM, 100 GB NVMe. Rust / Palworld / heavy mod packs.',
      cpuCores: 8,
      memoryMb: 16384,
      diskMb: 102400,
      slots: 100,
      prices: [
        { interval: 'MONTHLY', currency: 'USD', amountMinor: 3999 },
        { interval: 'QUARTERLY', currency: 'USD', amountMinor: 10797 },
        { interval: 'ANNUAL', currency: 'USD', amountMinor: 38390 },
      ],
    },
  ];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name,
        description: p.description,
        type: 'GAME_SERVER',
        isActive: true,
        cpuCores: p.cpuCores,
        memoryMb: p.memoryMb,
        diskMb: p.diskMb,
        slots: p.slots,
      },
      create: {
        id: uuidv7(),
        type: 'GAME_SERVER',
        name: p.name,
        slug: p.slug,
        description: p.description,
        isActive: true,
        cpuCores: p.cpuCores,
        memoryMb: p.memoryMb,
        diskMb: p.diskMb,
        slots: p.slots,
        allowedTemplateIds: [], // empty = all templates allowed
      },
    });

    for (const price of p.prices) {
      await prisma.price.upsert({
        where: {
          productId_interval_currency: {
            productId: product.id,
            interval: price.interval,
            currency: price.currency,
          },
        },
        update: { amountMinor: price.amountMinor, isActive: true },
        create: {
          id: uuidv7(),
          productId: product.id,
          interval: price.interval,
          currency: price.currency,
          amountMinor: price.amountMinor,
          isActive: true,
        },
      });
    }
  }
  console.log(`  • Products: ${products.map((p) => p.slug).join(', ')}`);
}

async function seedTemplates(categorySlugToId: Record<string, string>) {
  const files = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.json'));
  let count = 0;

  for (const file of files) {
    const raw = readFileSync(join(TEMPLATES_DIR, file), 'utf8');
    const tpl = JSON.parse(raw) as TemplateFile;

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

  console.log(`  • Game templates: ${count} loaded from ${TEMPLATES_DIR}`);
}

/**
 * Create a GPortal-style per-slot Product for each game template, deriving
 * per-slot resources from the template's recommended specs and pricing each
 * billing interval (with longer terms discounted). Idempotent: products/prices
 * are only written on first creation, so admin tuning persists across re-seeds.
 * Legacy per-loader Minecraft eggs are skipped (the unified `minecraft` covers them).
 */
async function seedPerSlotProducts() {
  const LEGACY = new Set([
    'minecraft-paper',
    'minecraft-fabric',
    'minecraft-forge',
    'minecraft-neoforge',
  ]);
  const BASE_SLOTS = 8; // rec resources are treated as ~8 slots' worth
  const templates = await prisma.gameTemplate.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      recCpuCores: true,
      recMemoryMb: true,
      recDiskMb: true,
    },
  });

  let count = 0;
  for (const t of templates) {
    if (LEGACY.has(t.slug)) continue;

    const memoryMbPerSlot = Math.max(256, Math.round(t.recMemoryMb / BASE_SLOTS));
    const cpuPerSlot = Math.max(0.1, Math.round((t.recCpuCores / BASE_SLOTS) * 100) / 100);
    const diskMbPerSlot = Math.max(512, Math.round(t.recDiskMb / BASE_SLOTS));
    // ~$1.50 per GB-of-RAM per slot per month, floored at $0.50.
    const monthly = Math.max(50, Math.round((memoryMbPerSlot / 1024) * 150));

    const slug = `gs-${t.slug}`;
    const product = await prisma.product.upsert({
      where: { slug },
      // Don't clobber admin-tuned products on re-seed; just ensure the link.
      update: { gameTemplateId: t.id, perSlot: true },
      create: {
        id: uuidv7(),
        type: 'GAME_SERVER',
        name: t.name,
        slug,
        description: `${t.name} game server — pay per slot.`,
        isActive: true,
        perSlot: true,
        gameTemplateId: t.id,
        allowedTemplateIds: [t.id],
        minSlots: 2,
        maxSlots: 64,
        slotStep: 2,
        cpuPerSlot,
        memoryMbPerSlot,
        diskMbPerSlot,
      },
    });

    // Per-slot price per interval (discounts grow with term length).
    const prices: Array<[string, number]> = [
      ['MONTHLY', monthly],
      ['QUARTERLY', Math.round(monthly * 3 * 0.9)],
      ['SEMIANNUAL', Math.round(monthly * 6 * 0.85)],
      ['ANNUAL', Math.round(monthly * 12 * 0.8)],
    ];
    for (const [interval, amountMinor] of prices) {
      await prisma.price.upsert({
        where: {
          productId_interval_currency: {
            productId: product.id,
            interval: interval as Prisma.PriceCreateInput['interval'],
            currency: 'USD',
          },
        },
        update: {}, // preserve admin-tuned prices on re-seed
        create: {
          id: uuidv7(),
          productId: product.id,
          interval: interval as Prisma.PriceCreateInput['interval'],
          currency: 'USD',
          amountMinor,
          isActive: true,
        },
      });
    }
    count += 1;
  }
  console.log(`  • Per-slot products: ${count}`);
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
    await seedProducts();
    await seedTemplates(categorySlugToId);
  } else {
    console.log(
      'Demo content: skipped (already initialised; set SEED_DEMO=true to force).',
    );
  }

  // Ensure a per-slot storefront product exists for every game template that's
  // present. Runs every deploy (create-only — never clobbers admin tuning and
  // respects deactivation), so the order page has a plan per game without forcing
  // SEED_DEMO and without resurrecting other demo content.
  console.log('Storefront plans:');
  await seedPerSlotProducts();

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
