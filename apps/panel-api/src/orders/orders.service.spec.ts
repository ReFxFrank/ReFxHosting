import { OrdersService } from './orders.service';

/**
 * P0-C regression: the customer must never be charged before a provisionable
 * server + allocation is reserved. These tests assert the ORDERING — the server
 * reservation (servers.create with deferProvision) happens before any
 * settlement call, and a reservation failure rolls back without charging.
 */
function build() {
  const calls: string[] = [];

  const price = {
    id: 'price-1',
    productId: 'prod-1',
    interval: 'MONTHLY',
    amountMinor: 1000,
    isActive: true,
    hardwareTierId: 'tier-1',
    hardwareTier: { id: 'tier-1', productId: 'prod-1', isActive: true },
    product: { id: 'prod-1', isActive: true, billingModel: 'HARDWARE_TIER' },
  };

  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        emailVerifiedAt: new Date(),
        addressLine1: '1 St',
        city: 'Town',
        postalCode: 'AB1',
        country: 'GB',
        region: null,
      }),
    },
    price: { findUnique: jest.fn().mockResolvedValue(price) },
  } as any;

  const billing = {
    createSubscription: jest
      .fn()
      .mockImplementation(async () => {
        calls.push('createSubscription');
        return { id: 'sub-1' };
      }),
    createInvoiceForSubscription: jest.fn().mockImplementation(async () => {
      calls.push('createInvoice');
      return { id: 'inv-1', totalMinor: 1000, currency: 'GBP' };
    }),
    markInvoicePaid: jest.fn().mockImplementation(async () => {
      calls.push('markInvoicePaid');
    }),
    payInvoice: jest.fn().mockImplementation(async () => {
      calls.push('payInvoice');
      return { paid: true };
    }),
    startPayPalSubscription: jest.fn(),
    abandonUnpaidOrder: jest.fn().mockImplementation(async () => {
      calls.push('abandonUnpaidOrder');
    }),
  } as any;

  const coupons = { validate: jest.fn(), reserveRedemption: jest.fn(), attachRedemption: jest.fn() } as any;
  const giftCards = { lookup: jest.fn(), redeemForInvoice: jest.fn() } as any;
  const credit = { applyToInvoice: jest.fn() } as any;

  const servers = {
    create: jest.fn().mockImplementation(async () => {
      calls.push('servers.create');
      return { id: 'srv-1' };
    }),
  } as any;

  const svc = new OrdersService(prisma, billing, coupons, giftCards, credit, servers);
  return { svc, calls, billing, servers };
}

const dto = {
  productId: 'prod-1',
  priceId: 'price-1',
  templateId: 'tpl-1',
  name: 'srv',
  hardwareTierId: 'tier-1',
  gateway: 'stripe' as const,
};

describe('OrdersService.create — charge only after reservation (P0-C)', () => {
  it('reserves the server BEFORE settling payment', async () => {
    const { svc, calls, servers } = build();
    await svc.create('user-1', { ...dto });
    // servers.create (reservation) must precede any settlement call.
    const reserveIdx = calls.indexOf('servers.create');
    const payIdx = calls.indexOf('payInvoice');
    expect(reserveIdx).toBeGreaterThanOrEqual(0);
    expect(payIdx).toBeGreaterThan(reserveIdx);
    // reserved (deferred), never installed directly by the order path.
    expect(servers.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ subscriptionId: 'sub-1', templateId: 'tpl-1' }),
      { deferProvision: true },
    );
  });

  it('does NOT charge and rolls back when the server cannot be reserved', async () => {
    const { svc, calls, billing, servers } = build();
    servers.create.mockRejectedValueOnce(new Error('No node has capacity'));

    await expect(svc.create('user-1', { ...dto })).rejects.toThrow(
      'No node has capacity',
    );

    // No settlement of any kind happened.
    expect(billing.markInvoicePaid).not.toHaveBeenCalled();
    expect(billing.payInvoice).not.toHaveBeenCalled();
    // The reservation was rolled back (subscription abandoned).
    expect(billing.abandonUnpaidOrder).toHaveBeenCalledWith('sub-1');
    expect(calls).not.toContain('payInvoice');
    expect(calls).not.toContain('markInvoicePaid');
  });
});
