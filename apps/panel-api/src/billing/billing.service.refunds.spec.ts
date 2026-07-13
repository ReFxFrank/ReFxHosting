import { BadRequestException } from "@nestjs/common";
import { BillingService } from "./billing.service";

/**
 * P0-F/G: refunds revoke entitlement, paid invoices are immutable, and refund
 * recording is idempotent. Prisma + gateways mocked.
 */
describe("BillingService refunds & invoice immutability (P0-F/G)", () => {
  function make() {
    const prisma: any = {
      invoice: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      server: { findMany: jest.fn().mockResolvedValue([]) },
      subscription: { updateMany: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const config = {
      get: jest.fn(() => ({ defaultCurrency: "USD", invoiceNumberPrefix: "INV", schedulerEnabled: true })),
    };
    const stripe = { name: "stripe", refund: jest.fn().mockResolvedValue({ refundRef: "re_1" }) };
    const paypal = { name: "paypal", refund: jest.fn().mockResolvedValue({ refundRef: "pp_re_1" }) };
    const noop = {};
    const suspensionQueue = { add: jest.fn() };
    const svc = new BillingService(
      prisma as any, config as any, stripe as any, paypal as any,
      noop as any, noop as any, noop as any, noop as any, noop as any,
      { add: jest.fn() } as any, suspensionQueue as any, { add: jest.fn() } as any,
    );
    return { svc, prisma, stripe, suspensionQueue };
  }

  const paid = (o: Record<string, unknown> = {}) => ({
    id: "inv-1", number: "INV-1", userId: "u-1", state: "PAID", currency: "USD",
    totalMinor: 1000, amountPaidMinor: 1000, subscriptionId: "sub-1", ...o,
  });

  // ---- G: immutable financial records -------------------------------------
  describe("deleteInvoice", () => {
    it("refuses to delete a PAID invoice", async () => {
      const { svc, prisma } = make();
      prisma.invoice.findUnique.mockResolvedValue(paid());
      await expect(svc.deleteInvoice("inv-1")).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.invoice.delete).not.toHaveBeenCalled();
    });

    it("refuses to delete a REFUNDED invoice", async () => {
      const { svc, prisma } = make();
      prisma.invoice.findUnique.mockResolvedValue(paid({ state: "REFUNDED" }));
      await expect(svc.deleteInvoice("inv-1")).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.invoice.delete).not.toHaveBeenCalled();
    });

    it("allows deleting an OPEN (unpaid) invoice", async () => {
      const { svc, prisma } = make();
      prisma.invoice.findUnique.mockResolvedValue(paid({ state: "OPEN", subscriptionId: null }));
      await svc.deleteInvoice("inv-1");
      expect(prisma.invoice.delete).toHaveBeenCalledWith({ where: { id: "inv-1" } });
    });
  });

  // ---- G: refund revokes entitlement --------------------------------------
  describe("refundInvoice", () => {
    it("suspends the subscription's servers on a FULL refund", async () => {
      const { svc, prisma, suspensionQueue } = make();
      prisma.invoice.findUnique.mockResolvedValue(paid());
      prisma.payment.findFirst.mockResolvedValue({ id: "p1", gateway: "stripe", gatewayRef: "pi_1", state: "SUCCEEDED" });
      prisma.server.findMany.mockResolvedValue([{ id: "srv-1" }]);

      const res = await svc.refundInvoice("inv-1", undefined, "admin-1");

      expect(res.full).toBe(true);
      expect(suspensionQueue.add).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ serverId: "srv-1", action: "suspend" }),
        expect.anything(),
      );
    });

    it("does NOT suspend on a PARTIAL refund", async () => {
      const { svc, prisma, suspensionQueue } = make();
      prisma.invoice.findUnique.mockResolvedValue(paid());
      prisma.payment.findFirst.mockResolvedValue({ id: "p1", gateway: "stripe", gatewayRef: "pi_1", state: "SUCCEEDED" });
      prisma.server.findMany.mockResolvedValue([{ id: "srv-1" }]);

      const res = await svc.refundInvoice("inv-1", 400, "admin-1");

      expect(res.full).toBe(false);
      expect(suspensionQueue.add).not.toHaveBeenCalled();
    });
  });

  // ---- G: external reversal (webhook/dispute) suspends + idempotent -------
  describe("refundExternalPayment", () => {
    it("records the reversal and suspends servers", async () => {
      const { svc, prisma, suspensionQueue } = make();
      prisma.invoice.findUnique.mockResolvedValue(paid());
      prisma.server.findMany.mockResolvedValue([{ id: "srv-1" }]);
      await svc.refundExternalPayment("inv-1", { gateway: "stripe", gatewayRef: "pi_x" });
      expect(prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { state: "REFUNDED" } }),
      );
      expect(suspensionQueue.add).toHaveBeenCalled();
    });

    it("is a no-op when the invoice is already REFUNDED (idempotent)", async () => {
      const { svc, prisma, suspensionQueue } = make();
      prisma.invoice.findUnique.mockResolvedValue(paid({ state: "REFUNDED" }));
      await svc.refundExternalPayment("inv-1", { gateway: "stripe", gatewayRef: "pi_x" });
      expect(prisma.payment.create).not.toHaveBeenCalled();
      expect(suspensionQueue.add).not.toHaveBeenCalled();
    });
  });

  // ---- map a gateway payment ref back to our invoice ----------------------
  describe("findInvoiceIdByPaymentRef", () => {
    it("resolves the invoice id from a SUCCEEDED payment ref", async () => {
      const { svc, prisma } = make();
      prisma.payment.findFirst.mockResolvedValue({ invoiceId: "inv-9" });
      await expect(svc.findInvoiceIdByPaymentRef("pi_9")).resolves.toBe("inv-9");
    });
    it("returns null for an unknown ref", async () => {
      const { svc, prisma } = make();
      prisma.payment.findFirst.mockResolvedValue(null);
      await expect(svc.findInvoiceIdByPaymentRef("nope")).resolves.toBeNull();
    });
  });
});
