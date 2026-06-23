import { ConflictException } from '@nestjs/common';
import { ServersService } from './servers.service';

/**
 * Unit tests for invoice-gated plan changes in ServersService.upgrade (hardware
 * tier path). Prisma, NodesService, the agent client and BillingService are all
 * mocked — no DB/Redis/network.
 *
 * Policy under test:
 *   - UPGRADE (dearer tier): raises a prorated invoice + a PendingPlanChange and
 *     returns { status: 'invoiced' } WITHOUT touching the server/subscription or
 *     the node agent (old config retained until payment clears),
 *   - DOWNGRADE (cheaper tier): records a PendingPlanChange(applyAtPeriodEnd) and
 *     returns { status: 'scheduled' } with no invoice and no live change,
 *   - a pre-existing pending change blocks a second one (ConflictException).
 */
describe('ServersService.upgrade (invoice-gated plan changes)', () => {
  let prisma: any;
  let nodes: { capacity: jest.Mock };
  let agent: { reconfigure: jest.Mock };
  let billing: { createUpgradeInvoice: jest.Mock; voidInvoice: jest.Mock };
  let service: ServersService;

  const SERVER_ID = 'srv-1';
  const SUB_ID = 'sub-1';
  const CUR_PRICE_ID = 'price-current';
  const NEW_PRICE_ID = 'price-new';
  const TIER_ID = 'tier-high';

  // A 30-day period centred on "now" → ~half remaining → proration factor ≈ 0.5.
  // Derived from the real clock (no Date.now mocking) so the test can't perturb
  // time-sensitive tests sharing a worker.
  const DAY = 24 * 60 * 60 * 1000;
  const PERIOD_START = new Date(Date.now() - 15 * DAY);
  const PERIOD_END = new Date(Date.now() + 15 * DAY);

  function server() {
    return {
      id: SERVER_ID,
      nodeId: 'node-1',
      node: { id: 'node-1' },
      subscriptionId: SUB_ID,
      cpuCores: 2,
      memoryMb: 4096,
      swapMb: 0,
      diskMb: 20000,
      ioWeight: 500,
      slots: 10,
      subscription: {
        id: SUB_ID,
        priceId: CUR_PRICE_ID,
        interval: 'MONTHLY',
        slots: 10,
        currentPeriodStart: PERIOD_START,
        currentPeriodEnd: PERIOD_END,
        product: { id: 'prod-1', perSlot: false },
      },
    };
  }

  function tier(amountMinor: number) {
    return {
      id: TIER_ID,
      name: 'High',
      isActive: true,
      cpuCores: 4,
      memoryMb: 8192,
      diskMb: 40000,
      recommendedPlayers: 20,
      prices: [
        { id: NEW_PRICE_ID, interval: 'MONTHLY', currency: 'USD', isActive: true, amountMinor },
      ],
    };
  }

  beforeEach(() => {
    prisma = {
      server: { findFirst: jest.fn().mockResolvedValue(server()), update: jest.fn() },
      hardwareTier: { findFirst: jest.fn() },
      price: { findUnique: jest.fn() },
      subscription: { update: jest.fn() },
      pendingPlanChange: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn((args: any) => args.data),
        update: jest.fn((args: any) => args),
        delete: jest.fn().mockResolvedValue(undefined),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    nodes = {
      capacity: jest.fn().mockResolvedValue({
        memory: { free: 1_000_000 },
        cpu: { free: 1000 },
        disk: { free: 10_000_000 },
      }),
    };
    agent = { reconfigure: jest.fn().mockResolvedValue(undefined) };
    billing = {
      createUpgradeInvoice: jest
        .fn()
        .mockResolvedValue({ id: 'inv-1', totalMinor: 600 }),
      voidInvoice: jest.fn().mockResolvedValue(undefined),
    };

    service = new ServersService(
      prisma,
      {} as any, // crypto
      nodes as any,
      agent as any,
      {} as any, // mcResolver
      billing as any,
      { add: jest.fn() } as any, // provisionQueue
      { add: jest.fn() } as any, // reinstallQueue
      { add: jest.fn() } as any, // suspensionQueue
    );
  });

  it('UPGRADE: bills a prorated invoice + stages the change, leaving the live config untouched', async () => {
    // current 1000/mo, new 2000/mo → delta 1000; half the period left → ~500 prorated.
    prisma.price.findUnique.mockResolvedValue({ currency: 'USD', amountMinor: 1000 });
    prisma.hardwareTier.findFirst.mockResolvedValue(tier(2000));

    const res = await service.upgrade(SERVER_ID, { hardwareTierId: TIER_ID });

    expect(res.status).toBe('invoiced');
    // Prorated ~half of the 1000 delta.
    const billArgs = billing.createUpgradeInvoice.mock.calls[0][1];
    expect(billArgs.amountMinor).toBeGreaterThan(450);
    expect(billArgs.amountMinor).toBeLessThan(550);
    // Slot claimed FIRST (no invoiceId yet), with the target config...
    expect(prisma.pendingPlanChange.create).toHaveBeenCalledTimes(1);
    const pending = prisma.pendingPlanChange.create.mock.calls[0][0].data;
    expect(pending).toMatchObject({
      subscriptionId: SUB_ID,
      applyAtPeriodEnd: false,
      priceId: NEW_PRICE_ID,
      hardwareTierId: TIER_ID,
      memoryMb: 8192,
    });
    expect(pending.invoiceId).toBeUndefined();
    // ...then the raised invoice is attached to that same staged row.
    expect(prisma.pendingPlanChange.update).toHaveBeenCalledWith({
      where: { id: pending.id },
      data: { invoiceId: 'inv-1' },
    });
    // CRUCIAL: nothing applied to the live server/subscription/agent yet.
    expect(prisma.server.update).not.toHaveBeenCalled();
    expect(prisma.subscription.update).not.toHaveBeenCalled();
    expect(agent.reconfigure).not.toHaveBeenCalled();
  });

  it('DOWNGRADE: schedules at period end with no invoice and no live change', async () => {
    prisma.price.findUnique.mockResolvedValue({ currency: 'USD', amountMinor: 2000 });
    prisma.hardwareTier.findFirst.mockResolvedValue(tier(1000)); // cheaper

    const res = await service.upgrade(SERVER_ID, { hardwareTierId: TIER_ID });

    expect(res.status).toBe('scheduled');
    expect(billing.createUpgradeInvoice).not.toHaveBeenCalled();
    const pending = prisma.pendingPlanChange.create.mock.calls[0][0].data;
    expect(pending).toMatchObject({ applyAtPeriodEnd: true });
    expect(pending.invoiceId).toBeUndefined();
    expect(prisma.server.update).not.toHaveBeenCalled();
    expect(agent.reconfigure).not.toHaveBeenCalled();
  });

  it('rejects a second plan change while one is pending', async () => {
    prisma.price.findUnique.mockResolvedValue({ currency: 'USD', amountMinor: 1000 });
    prisma.hardwareTier.findFirst.mockResolvedValue(tier(2000));
    prisma.pendingPlanChange.findUnique.mockResolvedValue({
      id: 'ppc-1',
      invoiceId: 'inv-old',
    });

    await expect(
      service.upgrade(SERVER_ID, { hardwareTierId: TIER_ID }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(billing.createUpgradeInvoice).not.toHaveBeenCalled();
    expect(prisma.pendingPlanChange.create).not.toHaveBeenCalled();
  });

  it('CANCEL (upgrade): voids the unpaid invoice, which clears the staged change', async () => {
    prisma.pendingPlanChange.findUnique.mockResolvedValue({
      id: 'ppc-1',
      subscriptionId: SUB_ID,
      invoiceId: 'inv-1',
    });

    await expect(service.cancelPlanChange(SERVER_ID)).resolves.toEqual({
      canceled: true,
    });
    expect(billing.voidInvoice).toHaveBeenCalledWith('inv-1');
    // void() is what clears the pending row (deleteMany by invoiceId), so we
    // don't also delete it directly here.
    expect(prisma.pendingPlanChange.delete).not.toHaveBeenCalled();
  });

  it('CANCEL (downgrade): drops the scheduled change directly (no invoice to void)', async () => {
    prisma.pendingPlanChange.findUnique.mockResolvedValue({
      id: 'ppc-2',
      subscriptionId: SUB_ID,
      invoiceId: null,
    });

    await expect(service.cancelPlanChange(SERVER_ID)).resolves.toEqual({
      canceled: true,
    });
    expect(prisma.pendingPlanChange.delete).toHaveBeenCalledWith({
      where: { id: 'ppc-2' },
    });
    expect(billing.voidInvoice).not.toHaveBeenCalled();
  });

  it('CANCEL: errors when there is nothing staged', async () => {
    prisma.pendingPlanChange.findUnique.mockResolvedValue(null);
    await expect(service.cancelPlanChange(SERVER_ID)).rejects.toBeTruthy();
  });
});
