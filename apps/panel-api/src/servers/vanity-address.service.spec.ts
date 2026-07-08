import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { VanityAddressService } from './vanity-address.service';

/**
 * Unit tests for the paid custom-address purchase flow: owner-only, feature
 * gating, claim-then-invoice choreography with rollback, free-fee immediate
 * apply, and removal. Prisma/billing/settings are mocked.
 */
describe('VanityAddressService', () => {
  const SERVER = {
    id: 'srv-1',
    ownerId: 'owner-1',
    shortId: '088a778c',
    vanityLabel: null as string | null,
    subscriptionId: 'sub-1',
    node: { gameDomain: 'virginia.rfx.refx.gg' },
  };

  let prisma: any;
  let billing: any;
  let credit: any;
  let settings: any;
  let svc: VanityAddressService;

  const p2002 = (target: string[]) => {
    const err = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target },
    });
    return err;
  };

  beforeEach(() => {
    prisma = {
      server: {
        findFirst: jest.fn().mockResolvedValue({ ...SERVER }),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      subscription: { findUnique: jest.fn().mockResolvedValue({ priceId: 'price-1' }) },
      price: { findUnique: jest.fn().mockResolvedValue({ currency: 'USD' }) },
      allocation: {
        findFirst: jest.fn().mockResolvedValue({ alias: '088a778c.virginia.rfx.refx.gg', ip: 'n1.refx.gg', port: 5007 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      pendingVanityAddress: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'pend-1' }),
        update: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      notification: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    billing = {
      createUpgradeInvoice: jest.fn().mockResolvedValue({
        id: 'inv-1',
        totalMinor: 200,
        currency: 'USD',
      }),
      voidInvoice: jest.fn().mockResolvedValue({}),
    };
    credit = { adjust: jest.fn().mockResolvedValue({ balanceMinor: 200 }) };
    settings = {
      vanityConfig: jest.fn().mockResolvedValue({
        enabled: true,
        feeMinor: 200,
        reservedWords: [],
      }),
    };
    svc = new VanityAddressService(prisma, billing, credit, settings);
  });

  it('rejects a non-owner (sub-user / staff) purchase', async () => {
    await expect(svc.purchase('srv-1', 'someone-else', 'coolname')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(billing.createUpgradeInvoice).not.toHaveBeenCalled();
  });

  it('rejects when the node has no game domain', async () => {
    prisma.server.findFirst.mockResolvedValue({ ...SERVER, node: { gameDomain: null } });
    await expect(svc.purchase('srv-1', 'owner-1', 'coolname')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects when the feature is disabled', async () => {
    settings.vanityConfig.mockResolvedValue({ enabled: false, feeMinor: 200, reservedWords: [] });
    await expect(svc.purchase('srv-1', 'owner-1', 'coolname')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('claims the reservation then invoices, returning the invoiced result', async () => {
    const res = await svc.purchase('srv-1', 'owner-1', 'CoolName');
    expect(prisma.pendingVanityAddress.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ serverId: 'srv-1', label: 'coolname' }),
      }),
    );
    expect(billing.createUpgradeInvoice).toHaveBeenCalledWith('sub-1', {
      amountMinor: 200,
      description: 'Custom server address: coolname.virginia.rfx.refx.gg',
    });
    expect(prisma.pendingVanityAddress.update).toHaveBeenCalledWith({
      where: { id: 'pend-1' },
      data: { invoiceId: 'inv-1' },
    });
    expect(res).toEqual({
      status: 'invoiced',
      label: 'coolname',
      address: 'coolname.virginia.rfx.refx.gg',
      invoiceId: 'inv-1',
      amountMinor: 200,
      currency: 'USD',
    });
  });

  it('rolls the reservation back when invoicing fails', async () => {
    billing.createUpgradeInvoice.mockRejectedValue(new Error('billing down'));
    await expect(svc.purchase('srv-1', 'owner-1', 'coolname')).rejects.toThrow('billing down');
    expect(prisma.pendingVanityAddress.deleteMany).toHaveBeenCalledWith({
      where: { id: 'pend-1' },
    });
  });

  it('maps P2002 on serverId to "purchase already pending"', async () => {
    prisma.pendingVanityAddress.create.mockRejectedValue(p2002(['serverId']));
    await expect(svc.purchase('srv-1', 'owner-1', 'coolname')).rejects.toThrow(
      /already pending/i,
    );
  });

  it('maps P2002 on label to "just reserved by someone else"', async () => {
    prisma.pendingVanityAddress.create.mockRejectedValue(p2002(['label']));
    await expect(svc.purchase('srv-1', 'owner-1', 'coolname')).rejects.toThrow(
      /reserved by someone else/i,
    );
  });

  it('conflicts when another server already owns the label', async () => {
    prisma.server.findUnique.mockResolvedValue({ id: 'other-server' });
    await expect(svc.purchase('srv-1', 'owner-1', 'coolname')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('applies immediately (no invoice) when the fee is 0', async () => {
    settings.vanityConfig.mockResolvedValue({ enabled: true, feeMinor: 0, reservedWords: [] });
    const res = await svc.purchase('srv-1', 'owner-1', 'coolname');
    expect(res).toEqual({
      status: 'applied',
      label: 'coolname',
      address: 'coolname.virginia.rfx.refx.gg',
    });
    expect(billing.createUpgradeInvoice).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('remove voids the pending invoice when one exists', async () => {
    prisma.pendingVanityAddress.findUnique.mockResolvedValue({
      id: 'pend-1',
      invoiceId: 'inv-1',
    });
    const res = await svc.remove('srv-1', 'owner-1');
    expect(billing.voidInvoice).toHaveBeenCalledWith('inv-1');
    expect(res).toEqual({ removed: true });
  });

  it('remove reverts an owned label to the shortId address', async () => {
    prisma.server.findFirst.mockResolvedValue({ ...SERVER, vanityLabel: 'coolname' });
    const res = await svc.remove('srv-1', 'owner-1');
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(res).toEqual({ removed: true });
  });

  it('adminRemove refunds the fee as credit when asked', async () => {
    prisma.server.findFirst.mockResolvedValue({ ...SERVER, vanityLabel: 'badword' });
    await svc.adminRemove('srv-1', { refundCredit: true, actorId: 'admin-1' });
    expect(credit.adjust).toHaveBeenCalledWith(
      'owner-1',
      200,
      'REFUND',
      expect.objectContaining({ actorId: 'admin-1' }),
    );
    expect(prisma.notification.create).toHaveBeenCalled();
  });
});
