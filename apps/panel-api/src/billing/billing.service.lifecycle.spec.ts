import { BillingService } from "./billing.service";
import { SUBSCRIPTION_PUBLIC_SELECT } from "./subscription-public.util";

/**
 * P0-D (cancellation lifecycle) + P0-E (gateway-aware renewal). Prisma, gateways
 * and queues are mocked; only the state-machine logic is exercised, using a
 * fixed "now" so the expiry sweep is deterministic.
 */
describe("BillingService lifecycle (P0-D / P0-E)", () => {
  function make() {
    const prisma: any = {
      invoice: { findFirst: jest.fn().mockResolvedValue(null) },
      subscription: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      server: { findMany: jest.fn().mockResolvedValue([]) },
      pendingPlanChange: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const config = {
      get: jest.fn((k: string) =>
        k === "billing"
          ? { defaultCurrency: "USD", invoiceNumberPrefix: "INV", schedulerEnabled: true }
          : "http://localhost:3000",
      ),
    };
    const stripe = { name: "stripe", charge: jest.fn() };
    const paypal = { name: "paypal", cancelSubscription: jest.fn().mockResolvedValue(undefined) };
    const settings = {};
    const referrals = {};
    const email = {};
    const notifications = {};
    const push = {};
    const renewalQueue = { add: jest.fn() };
    const suspensionQueue = { add: jest.fn() };
    const provisionQueue = { add: jest.fn() };
    const svc = new BillingService(
      prisma as any,
      config as any,
      stripe as any,
      paypal as any,
      settings as any,
      referrals as any,
      email as any,
      notifications as any,
      push as any,
      renewalQueue as any,
      suspensionQueue as any,
      provisionQueue as any,
    );
    return { svc, prisma, stripe, suspensionQueue };
  }

  // ---- P0-D: cancel-at-period-end expiry ----------------------------------
  describe("expireDueCancellations", () => {
    it("expires a past-period cancel-at-period-end sub and suspends its servers", async () => {
      const { svc, prisma, suspensionQueue } = make();
      prisma.subscription.findMany.mockResolvedValue([{ id: "sub-1" }]);
      prisma.server.findMany.mockResolvedValue([{ id: "srv-1" }, { id: "srv-2" }]);

      const n = await svc.expireDueCancellations();

      expect(n).toBe(1);
      // Guarded claim flips it to EXPIRED.
      expect(prisma.subscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "sub-1", cancelAtPeriodEnd: true }),
          data: expect.objectContaining({ state: "EXPIRED", autoRenew: false }),
        }),
      );
      // Both servers get a suspend job.
      expect(suspensionQueue.add).toHaveBeenCalledTimes(2);
      expect(suspensionQueue.add).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ serverId: "srv-1", action: "suspend" }),
        expect.anything(),
      );
    });

    it("only matches ACTIVE/TRIALING/PAST_DUE cancel-at-period-end subs with an elapsed period", async () => {
      const { svc, prisma } = make();
      prisma.subscription.findMany.mockResolvedValue([]);
      await svc.expireDueCancellations();
      const where = prisma.subscription.findMany.mock.calls[0][0].where;
      expect(where.cancelAtPeriodEnd).toBe(true);
      expect(where.currentPeriodEnd).toHaveProperty("lte");
      expect(where.state.in).toEqual(
        expect.arrayContaining(["ACTIVE", "TRIALING", "PAST_DUE"]),
      );
    });

    it("does not double-suspend when another instance already claimed the sub", async () => {
      const { svc, prisma, suspensionQueue } = make();
      prisma.subscription.findMany.mockResolvedValue([{ id: "sub-1" }]);
      prisma.subscription.updateMany.mockResolvedValue({ count: 0 }); // lost the race
      const n = await svc.expireDueCancellations();
      expect(n).toBe(0);
      expect(suspensionQueue.add).not.toHaveBeenCalled();
    });
  });

  // ---- P0-D: immediate cancel stops the server ----------------------------
  describe("cancelSubscription (immediate)", () => {
    it("suspends the subscription's servers on immediate cancel", async () => {
      const { svc, prisma, suspensionQueue } = make();
      prisma.subscription.findFirst.mockResolvedValue({
        id: "sub-1",
        userId: "u-1",
        gateway: "stripe",
        gatewaySubId: null,
      });
      prisma.server.findMany.mockResolvedValue([{ id: "srv-1" }]);

      await svc.cancelSubscription("u-1", "sub-1", false);

      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ state: "CANCELED" }) }),
      );
      expect(suspensionQueue.add).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ serverId: "srv-1", action: "suspend" }),
        expect.anything(),
      );
    });
  });

  // ---- Response hygiene: raw Subscription rows never reach the customer ----
  describe("subscription response projection", () => {
    it("cancelSubscription returns only the public projection (both branches)", async () => {
      const { svc, prisma } = make();
      prisma.subscription.findFirst.mockResolvedValue({
        id: "sub-1",
        userId: "u-1",
        gateway: "stripe",
        gatewaySubId: null,
        state: "ACTIVE",
      });

      await svc.cancelSubscription("u-1", "sub-1", true);
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ select: SUBSCRIPTION_PUBLIC_SELECT }),
      );

      prisma.subscription.update.mockClear();
      await svc.cancelSubscription("u-1", "sub-1", false);
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ select: SUBSCRIPTION_PUBLIC_SELECT }),
      );
    });

    it("resumeSubscription returns only the public projection", async () => {
      const { svc, prisma } = make();
      prisma.subscription.findFirst.mockResolvedValue({
        id: "sub-1",
        userId: "u-1",
        state: "ACTIVE",
      });

      await svc.resumeSubscription("u-1", "sub-1");
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ select: SUBSCRIPTION_PUBLIC_SELECT }),
      );
    });

    it("createSubscription returns only the public projection", async () => {
      const { svc, prisma } = make();
      prisma.price = {
        findUnique: jest.fn().mockResolvedValue({
          id: "price-1",
          productId: "prod-1",
          interval: "MONTHLY",
          hardwareTierId: null,
        }),
      };
      prisma.subscription.create = jest.fn().mockResolvedValue({ id: "sub-1" });

      await svc.createSubscription("u-1", {
        productId: "prod-1",
        priceId: "price-1",
        interval: "MONTHLY",
      } as any);
      expect(prisma.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({ select: SUBSCRIPTION_PUBLIC_SELECT }),
      );
    });

    it("the public projection carries no processor linkage or attribution", () => {
      const keys = Object.keys(SUBSCRIPTION_PUBLIC_SELECT);
      expect(keys).not.toContain("gatewaySubId");
      expect(keys).not.toContain("attribution");
      expect(keys).not.toContain("renewalReminderSentAt");
      expect(keys).not.toContain("expressBackupsComp");
    });
  });

  // ---- P0-E: PayPal subs excluded from the Stripe renewal path -------------
  describe("renewSubscription gateway routing", () => {
    it("does NOT Stripe-charge or suspend a PayPal-managed subscription", async () => {
      const { svc, prisma, stripe, suspensionQueue } = make();
      prisma.subscription.findUnique.mockResolvedValue({
        id: "sub-pp",
        userId: "u-1",
        gateway: "paypal",
        cancelAtPeriodEnd: false,
        state: "ACTIVE",
        currentPeriodEnd: new Date(0),
        interval: "MONTHLY",
      });

      const res = await svc.renewSubscription("sub-pp");

      expect(res.reason).toBe("paypal-managed");
      expect(res.paid).toBe(false);
      expect(stripe.charge).not.toHaveBeenCalled();
      expect(suspensionQueue.add).not.toHaveBeenCalled();
      // No invoice was even looked up for the PayPal sub.
      expect(prisma.invoice.findFirst).not.toHaveBeenCalled();
    });

    it("excludes PayPal subs from findDueSubscriptions and findPastDueSubscriptions", async () => {
      const { svc, prisma } = make();
      prisma.subscription.findMany.mockResolvedValue([]);
      await svc.findDueSubscriptions();
      await svc.findPastDueSubscriptions();
      for (const call of prisma.subscription.findMany.mock.calls) {
        expect(call[0].where.gateway).toEqual({ not: "paypal" });
      }
    });
  });
});
