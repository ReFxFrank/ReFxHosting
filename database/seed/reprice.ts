/**
 * ReFx Hosting — re-price hardware tiers from a $/GB rate
 * ---------------------------------------------------------------------------
 * Recomputes EVERY HardwareTier's prices as `tier RAM (GB) × rate`, across all
 * six billing intervals (weekly → annual), using the same discount curve as the
 * seed. Unlike the seed (create-only, never clobbers), this OVERWRITES existing
 * prices — it's the tool for applying a new pricing basis to the live storefront.
 *
 * Rate (USD cents per GB / month) resolves from: --rate=NNN  >  env
 * SEED_PRICE_PER_GB_CENTS  >  500 ($5/GB). See docs/25-pricing.md for the basis.
 *
 * SAFE BY DEFAULT: prints what would change (dry run). Pass --apply to write.
 *
 *   # preview:
 *   npx ts-node --transpile-only --project tsconfig.seed.json database/seed/reprice.ts
 *   # apply:
 *   npx ts-node --transpile-only --project tsconfig.seed.json database/seed/reprice.ts --apply
 *
 * In the stack (prod), via the migrate image:
 *   infra/scripts/dc run --rm --entrypoint sh migrate -c \
 *     "cd /repo && npx ts-node --transpile-only --project /repo/tsconfig.seed.json database/seed/reprice.ts --apply"
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const rateArg = args.find((a) => a.startsWith('--rate='))?.split('=')[1];
const RATE =
  Number.parseInt(rateArg ?? process.env.SEED_PRICE_PER_GB_CENTS ?? '', 10) ||
  400;
const CURRENCY = 'USD';
const FLOOR = 500; // never price a tier below $5/mo

type Interval =
  | 'WEEKLY'
  | 'BIWEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'SEMIANNUAL'
  | 'ANNUAL';

/** Same curve as the seed: short terms proportional, long terms discounted. */
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

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

async function main(): Promise<void> {
  console.log(
    `\nRe-pricing hardware tiers @ ${fmt(RATE)}/GB/month (${CURRENCY}) — ${
      APPLY ? 'APPLY (writing)' : 'DRY RUN (no changes)'
    }\n`,
  );

  const tiers = await prisma.hardwareTier.findMany({
    include: { product: { select: { name: true } } },
    orderBy: [{ product: { name: 'asc' } }, { sortOrder: 'asc' }],
  });

  let changed = 0;
  for (const tier of tiers) {
    const gb = tier.memoryMb / 1024;
    const monthly = Math.max(FLOOR, Math.round(gb * RATE));

    // Current monthly (for the diff line) and per-interval upserts.
    const current = await prisma.price.findFirst({
      where: {
        productId: tier.productId,
        hardwareTierId: tier.id,
        interval: 'MONTHLY' as Prisma.PriceCreateInput['interval'],
        currency: CURRENCY,
      },
      select: { amountMinor: true },
    });
    const before = current?.amountMinor;
    const same = before === monthly;
    if (!same) changed++;

    console.log(
      `  ${tier.product.name} · ${tier.name} · ${gb} GB: ` +
        `${before != null ? fmt(before) : '—'} → ${fmt(monthly)}/mo` +
        (same ? '  (unchanged)' : ''),
    );

    if (!APPLY) continue;

    for (const [interval, amountMinor] of intervalPrices(monthly)) {
      const prismaInterval = interval as Prisma.PriceCreateInput['interval'];
      const existing = await prisma.price.findFirst({
        where: {
          productId: tier.productId,
          hardwareTierId: tier.id,
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
            productId: tier.productId,
            hardwareTierId: tier.id,
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
    `\n${APPLY ? 'Applied' : 'Would change'} ${changed} of ${tiers.length} tier(s).` +
      (APPLY ? '' : '  Re-run with --apply to write.') +
      '\n',
  );
}

main()
  .catch((e) => {
    console.error('[reprice] failed:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
