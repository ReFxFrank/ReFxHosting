/**
 * ReFx Hosting — resync hardware tiers to their egg's recommended specs
 * ---------------------------------------------------------------------------
 * Resizes EXISTING Low/Mid/High HardwareTiers (cpu/mem/disk) from each game
 * template's recommended specs — using the same 0.5x / 1x / 2x formula the seed
 * uses — and reprices them (price = tier RAM GB x rate). This is the tool for
 * pushing an egg's spec change (e.g. ARK 12->16 GB) onto already-seeded tiers,
 * which the create-only seeder leaves at their original sizes.
 *
 * Only the three standard tiers (name contains Low/Mid/High) are touched; custom
 * admin tiers are left alone. Rate (USD cents/GB/mo): --rate=NNN >
 * SEED_PRICE_PER_GB_CENTS > 500 ($5/GB). See docs/25-pricing.md.
 *
 * SAFE BY DEFAULT (dry run). Pass --apply to write.
 *   npx ts-node --transpile-only --project tsconfig.seed.json database/seed/resync-tiers.ts
 *   npx ts-node --transpile-only --project tsconfig.seed.json database/seed/resync-tiers.ts --apply
 * In the stack (prod):
 *   infra/scripts/dc run --rm --entrypoint sh migrate -c \
 *     "cd /repo && npx ts-node --transpile-only --project /repo/tsconfig.seed.json database/seed/resync-tiers.ts --apply"
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const RATE =
  Number.parseInt(
    args.find((a) => a.startsWith('--rate='))?.split('=')[1] ??
      process.env.SEED_PRICE_PER_GB_CENTS ??
      '',
    10,
  ) || 500;
const CURRENCY = 'USD';

type Interval =
  | 'WEEKLY'
  | 'BIWEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'SEMIANNUAL'
  | 'ANNUAL';

/** Same discount curve as the seed. */
function intervalPrices(monthly: number): Array<[Interval, number]> {
  return [
    ['WEEKLY', Math.max(1, Math.round((monthly * 7) / 30))],
    ['BIWEEKLY', Math.max(1, Math.round((monthly * 14) / 30))],
    ['MONTHLY', monthly],
    ['QUARTERLY', Math.round(monthly * 3 * 0.9)],
    ['SEMIANNUAL', Math.round(monthly * 6 * 0.85)],
    ['ANNUAL', Math.round(monthly * 12 * 0.8)],
  ];
}

/** Tier multiplier from its name (matches the seed's Low/Mid/High = 0.5/1/2x). */
function multFor(name: string): number | null {
  const n = name.toLowerCase();
  if (n.includes('low')) return 0.5;
  if (n.includes('mid')) return 1;
  if (n.includes('high')) return 2;
  return null;
}

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
const gb = (mb: number) => `${(mb / 1024).toFixed(mb % 1024 ? 1 : 0)}GB`;

async function main(): Promise<void> {
  console.log(
    `\nResync tiers to egg recommended specs @ ${fmt(RATE)}/GB/mo — ${
      APPLY ? 'APPLY (writing)' : 'DRY RUN (no changes)'
    }\n`,
  );

  const tiers = await prisma.hardwareTier.findMany({
    include: { product: { include: { gameTemplate: true } } },
    orderBy: [{ product: { name: 'asc' } }, { sortOrder: 'asc' }],
  });

  let changed = 0;
  for (const t of tiers) {
    const tpl = t.product.gameTemplate;
    const mult = multFor(t.name);
    if (!tpl || mult == null) continue; // skip custom tiers / non-game products

    const cpuCores = Math.max(1, Math.round(tpl.recCpuCores * mult * 2) / 2);
    const memoryMb = Math.max(1024, Math.round((tpl.recMemoryMb * mult) / 512) * 512);
    const diskMb = Math.max(5120, Math.round((tpl.recDiskMb * mult) / 1024) * 1024);
    const monthly = Math.max(500, Math.round((memoryMb / 1024) * RATE));

    const specChanged =
      cpuCores !== t.cpuCores || memoryMb !== t.memoryMb || diskMb !== t.diskMb;
    const current = await prisma.price.findFirst({
      where: {
        productId: t.productId,
        hardwareTierId: t.id,
        interval: 'MONTHLY' as Prisma.PriceCreateInput['interval'],
        currency: CURRENCY,
      },
      select: { amountMinor: true },
    });
    const priceChanged = current?.amountMinor !== monthly;
    if (!specChanged && !priceChanged) continue;
    changed++;

    console.log(
      `  ${t.product.name} · ${t.name}: ` +
        `${gb(t.memoryMb)}/${t.cpuCores}cpu/${gb(t.diskMb)} → ` +
        `${gb(memoryMb)}/${cpuCores}cpu/${gb(diskMb)}  ` +
        `${current ? fmt(current.amountMinor) : '—'} → ${fmt(monthly)}/mo`,
    );

    if (!APPLY) continue;

    await prisma.hardwareTier.update({
      where: { id: t.id },
      data: { cpuCores, memoryMb, diskMb },
    });
    for (const [interval, amountMinor] of intervalPrices(monthly)) {
      const prismaInterval = interval as Prisma.PriceCreateInput['interval'];
      const existing = await prisma.price.findFirst({
        where: {
          productId: t.productId,
          hardwareTierId: t.id,
          interval: prismaInterval,
          currency: CURRENCY,
        },
        select: { id: true },
      });
      if (existing) {
        await prisma.price.update({
          where: { id: existing.id },
          data: { amountMinor, isActive: true },
        });
      } else {
        await prisma.price.create({
          data: {
            id: randomUUID(),
            productId: t.productId,
            hardwareTierId: t.id,
            interval: prismaInterval,
            currency: CURRENCY,
            amountMinor,
            isActive: true,
          },
        });
      }
    }
  }

  console.log(
    `\n${APPLY ? 'Applied' : 'Would change'} ${changed} tier(s).` +
      (APPLY ? '' : '  Re-run with --apply to write.') +
      '\n',
  );
}

main()
  .catch((e) => {
    console.error('[resync-tiers] failed:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
