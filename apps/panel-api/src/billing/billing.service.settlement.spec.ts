import { BillingService } from './billing.service';

/**
 * The settlement / dunning / renewal engine moves real money, so these lock down
 * its critical invariants: webhook idempotency (no double-charge), the OPEN→PAID
 * transition + plan-change application, past-due dunning, and period rollover.
 * Prisma + gateways are mocked; only the money/state logic is exercised.
 */
describe('BillingService settlement engine', () => {
  function make() {
    const prisma: any = {
      invoice: { findUnique: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
      payment: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
      pendingPlanChange: { findUnique: jest.fn().mockResolvedValue(null) },
      subscription: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      server: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
      user: { findUnique: jest.fn().mockResolvedValue({ email: 'u@e.com', firstName: 'U' }) },
      paymentMethod: { findFirst: jest.fn() },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const config = {
      get: jest.fn((k: string) =>
        k === 'billing'
          ? { defaultCurrency: 'USD', invoiceNumberPrefix: 'INV', schedulerEnabled: true }
          : 'http://localhost:3000',
      ),
    };
    const stripe = { name: 'stripe', charge: jest.fn() };
    const paypal = { name: 'paypal' };
    const settings = {};
    const email = {
      sendPaymentReceipt: jest.fn().mockResolvedValue(undefined),
      sendPaymentFailed: jest.fn().mockResolvedValue(undefined),
    };
    const notifications = { createNotification: jest.fn().mockResolvedValue(undefined) };
    const push = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    const renewalQueue = { add: jest.fn() };
    const suspensionQueue = { add: jest.fn() };
    const provisionQueue = { add: jest.fn() };
    const svc = new BillingService(
      prisma as any,
      config as any,
      stripe as any,
      paypal as any,
      settings as any,
      email as any,
      notifications as any,
      push as any,
      renewalQueue as any,
      suspensionQueue as any,
      provisionQueue as any,
    );
    return { svc, prisma, stripe, email, suspensionQueue, provisionQueue };
  }

  const openInvoice = (over: Record<string, unknown> = {}) => ({
    id: 'inv-1',
    number: 'INV-1',
    userId: 'u-1',
    state: 'OPEN',
    currency: 'USD',
    totalMinor: 1500,
    amountPaidMinor: 0,
    subscriptionId: null,
    gateway: null,
    gatewayInvoiceId: null,
    ...over,
  });

  // ---- markInvoicePaid: idempotency + transition ---------------------------

  describe('markInvoicePaid', () => {
    it('is idempotent on a repeated gatewayRef — one Payment, no plan re-apply', async () => {
      const { svc, prisma } = make();
      prisma.invoice.findUnique.mockResolvedValue(openInvoice({ state: 'PAID' }));
      prisma.payment.findFirst.mockResolvedValue({ id: 'pay-existing' }); // already recorded
      const applySpy = jest.spyOn(svc, 'applyPendingPlanChange').mockResolvedValue(undefined);

      await svc.markInvoicePaid('inv-1', { gateway: 'stripe', gatewayRef: 'ch_dup' });

      expect(prisma.invoice.update).not.toHaveBeenCalled();
      expect(prisma.payment.create).not.toHaveBeenCalled();
      expect(applySpy).not.toHaveBeenCalled();
    });

    it('returns early for an already-PAID invoice with no gatewayRef', async () => {
      const { svc, prisma } = make();
      prisma.invoice.findUnique.mockResolvedValue(openInvoice({ state: 'PAID' }));
      // Empty gatewayRef → falls through to the already-PAID short-circuit.
      await svc.markInvoicePaid('inv-1', { gateway: 'manual', gatewayRef: '' });
      expect(prisma.invoice.update).not.toHaveBeenCalled();
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('settles an OPEN invoice: marks PAID, records a SUCCEEDED Payment, applies the plan upgrade', async () => {
      const { svc, prisma } = make();
      prisma.invoice.findUnique.mockResolvedValue(openInvoice());
      prisma.invoice.update.mockResolvedValue(openInvoice({ state: 'PAID' }));
      prisma.pendingPlanChange.findUnique.mockResolvedValue({ id: 'ppc-1', invoiceId: 'inv-1' });
      const applySpy = jest.spyOn(svc, 'applyPendingPlanChange').mockResolvedValue(undefined);

      await svc.markInvoicePaid('inv-1', { gateway: 'stripe', gatewayRef: 'ch_1' });

      expect(prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ state: 'PAID', amountPaidMinor: 1500 }) }),
      );
      const payData = prisma.payment.create.mock.calls[0][0].data;
      expect(payData).toMatchObject({ state: 'SUCCEEDED', gatewayRef: 'ch_1', amountMinor: 1500 });
      expect(applySpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'ppc-1' }));
    });

    it('does NOT re-apply the plan change on a re-delivered webhook for an already-PAID invoice', async () => {
      const { svc, prisma } = make();
      // Pre-update snapshot is PAID (re-delivery with a new ref slips past the dedupe).
      prisma.invoice.findUnique.mockResolvedValue(openInvoice({ state: 'PAID' }));
      prisma.invoice.update.mockResolvedValue(openInvoice({ state: 'PAID' }));
      prisma.pendingPlanChange.findUnique.mockResolvedValue({ id: 'ppc-1', invoiceId: 'inv-1' });
      const applySpy = jest.spyOn(svc, 'applyPendingPlanChange').mockResolvedValue(undefined);

      await svc.markInvoicePaid('inv-1', { gateway: 'stripe', gatewayRef: 'ch_new' });

      expect(applySpy).not.toHaveBeenCalled();
    });

    it('reactivates a PAST_DUE subscription and enqueues an unsuspend', async () => {
      const { svc, prisma, suspensionQueue } = make();
      prisma.invoice.findUnique.mockResolvedValue(openInvoice({ subscriptionId: 'sub-1' }));
      prisma.invoice.update.mockResolvedValue(openInvoice({ state: 'PAID', subscriptionId: 'sub-1' }));
      prisma.subscription.findUnique.mockResolvedValue({ id: 'sub-1', state: 'PAST_DUE' });

      await svc.markInvoicePaid('inv-1', { gateway: 'stripe', gatewayRef: 'ch_1' });

      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sub-1' }, data: { state: 'ACTIVE' } }),
      );
      expect(suspensionQueue.add).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'unsuspend', subscriptionId: 'sub-1' }),
      );
    });

    it('provisions servers that were held in PENDING_PAYMENT until the money cleared', async () => {
      const { svc, prisma, provisionQueue } = make();
      prisma.invoice.findUnique.mockResolvedValue(openInvoice({ subscriptionId: 'sub-1' }));
      prisma.invoice.update.mockResolvedValue(openInvoice({ state: 'PAID', subscriptionId: 'sub-1' }));
      prisma.subscription.findUnique.mockResolvedValue({ id: 'sub-1', state: 'ACTIVE' });
      prisma.server.findMany.mockResolvedValue([{ id: 'srv-1' }]);

      await svc.markInvoicePaid('inv-1', { gateway: 'stripe', gatewayRef: 'ch_1' });

      expect(prisma.server.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'srv-1' }, data: { state: 'INSTALLING' } }),
      );
      expect(provisionQueue.add).toHaveBeenCalledWith(expect.anything(), { serverId: 'srv-1' });
    });
  });

  // ---- handlePaymentFailure: dunning ---------------------------------------

  describe('handlePaymentFailure', () => {
    it('records a FAILED payment, sets the sub PAST_DUE, and suspends each server', async () => {
      const { svc, prisma, suspensionQueue } = make();
      prisma.invoice.findUnique.mockResolvedValue({
        ...openInvoice({ subscriptionId: 'sub-1' }),
        subscription: { id: 'sub-1', servers: [{ id: 'srv-1' }, { id: 'srv-2' }] },
      });

      await svc.handlePaymentFailure('inv-1', 'card_declined', { gateway: 'stripe', gatewayRef: 'ch_f' });

      expect(prisma.payment.create.mock.calls[0][0].data).toMatchObject({
        state: 'FAILED',
        failureReason: 'card_declined',
      });
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sub-1' }, data: { state: 'PAST_DUE' } }),
      );
      expect(suspensionQueue.add).toHaveBeenCalledTimes(2);
    });

    it('does not touch a subscription when the invoice has none', async () => {
      const { svc, prisma, suspensionQueue } = make();
      prisma.invoice.findUnique.mockResolvedValue({ ...openInvoice(), subscription: null });
      await svc.handlePaymentFailure('inv-1', 'no method');
      expect(prisma.subscription.update).not.toHaveBeenCalled();
      expect(suspensionQueue.add).not.toHaveBeenCalled();
    });
  });

  // ---- renewSubscription: rollover + dunning -------------------------------

  describe('renewSubscription', () => {
    const sub = (over: Record<string, unknown> = {}) => ({
      id: 'sub-1',
      userId: 'u-1',
      state: 'ACTIVE',
      interval: 'MONTHLY',
      cancelAtPeriodEnd: false,
      currentPeriodStart: new Date('2026-05-01T00:00:00Z'),
      currentPeriodEnd: new Date('2026-06-01T00:00:00Z'),
      ...over,
    });

    it('expires (does not renew) a cancel-at-period-end subscription', async () => {
      const { svc, prisma } = make();
      prisma.subscription.findUnique.mockResolvedValue(sub({ cancelAtPeriodEnd: true }));
      const res = await svc.renewSubscription('sub-1');
      expect(res.paid).toBe(false);
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { state: 'EXPIRED' } }),
      );
    });

    it('reuses an existing OPEN invoice (dunning) instead of raising a duplicate', async () => {
      const { svc, prisma, stripe } = make();
      prisma.subscription.findUnique.mockResolvedValue(sub());
      prisma.invoice.findFirst.mockResolvedValue(openInvoice({ subscriptionId: 'sub-1' }));
      prisma.paymentMethod.findFirst.mockResolvedValue({ gatewayRef: 'pm_1', isDefault: true });
      jest.spyOn(svc as any, 'getGatewayCustomerId').mockResolvedValue('cus_1');
      const createSpy = jest.spyOn(svc as any, 'createInvoiceForSubscription');
      stripe.charge.mockResolvedValue({ success: true, gatewayRef: 'ch_ok' });
      jest.spyOn(svc, 'markInvoicePaid').mockResolvedValue({} as any);

      await svc.renewSubscription('sub-1');
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('on a successful charge: settles the invoice and rolls the period forward', async () => {
      const { svc, prisma, stripe } = make();
      const s = sub();
      prisma.subscription.findUnique.mockResolvedValue(s);
      prisma.invoice.findFirst.mockResolvedValue(openInvoice({ subscriptionId: 'sub-1' }));
      prisma.paymentMethod.findFirst.mockResolvedValue({ gatewayRef: 'pm_1', isDefault: true });
      jest.spyOn(svc as any, 'getGatewayCustomerId').mockResolvedValue('cus_1');
      stripe.charge.mockResolvedValue({ success: true, gatewayRef: 'ch_ok' });
      const paidSpy = jest.spyOn(svc, 'markInvoicePaid').mockResolvedValue({} as any);

      const res = await svc.renewSubscription('sub-1');
      expect(res.paid).toBe(true);
      expect(paidSpy).toHaveBeenCalled();
      // New period starts where the old one ended.
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ state: 'ACTIVE', currentPeriodStart: s.currentPeriodEnd }),
        }),
      );
    });

    it('with no default payment method: marks the renewal failed (dunning), no rollover', async () => {
      const { svc, prisma } = make();
      prisma.subscription.findUnique.mockResolvedValue(sub());
      prisma.invoice.findFirst.mockResolvedValue(openInvoice({ subscriptionId: 'sub-1' }));
      prisma.paymentMethod.findFirst.mockResolvedValue(null);
      const failSpy = jest.spyOn(svc, 'handlePaymentFailure').mockResolvedValue(undefined);

      const res = await svc.renewSubscription('sub-1');
      expect(res.paid).toBe(false);
      expect(failSpy).toHaveBeenCalledWith('inv-1', expect.stringMatching(/payment method/));
      // No ACTIVE rollover update happened.
      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });

    it('on a declined charge: marks the renewal failed, no rollover', async () => {
      const { svc, prisma, stripe } = make();
      prisma.subscription.findUnique.mockResolvedValue(sub());
      prisma.invoice.findFirst.mockResolvedValue(openInvoice({ subscriptionId: 'sub-1' }));
      prisma.paymentMethod.findFirst.mockResolvedValue({ gatewayRef: 'pm_1', isDefault: true });
      jest.spyOn(svc as any, 'getGatewayCustomerId').mockResolvedValue('cus_1');
      stripe.charge.mockResolvedValue({ success: false, failureReason: 'card_declined', gatewayRef: 'ch_no' });
      const failSpy = jest.spyOn(svc, 'handlePaymentFailure').mockResolvedValue(undefined);

      const res = await svc.renewSubscription('sub-1');
      expect(res.paid).toBe(false);
      expect(failSpy).toHaveBeenCalledWith('inv-1', 'card_declined', expect.objectContaining({ gateway: 'stripe' }));
      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });
  });
});
