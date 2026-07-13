import { BillingService } from "./billing.service";

/**
 * P0-H: invoice numbering is allocated by an atomic INSERT … ON CONFLICT DO
 * UPDATE … RETURNING against InvoiceCounter, not a COUNT()+1 (which two
 * concurrent creates could read identically and then collide on the unique
 * Invoice.number). This locks in that the service uses the atomic path and
 * returns the sequence the DB hands back.
 */
describe("BillingService.nextInvoiceSequence (P0-H)", () => {
  function make() {
    const prisma: any = { $queryRaw: jest.fn() };
    const config = { get: jest.fn(() => ({ defaultCurrency: "USD", invoiceNumberPrefix: "INV", schedulerEnabled: true })) };
    const noop = {};
    const svc = new BillingService(
      prisma as any, config as any, noop as any, noop as any, noop as any,
      noop as any, noop as any, noop as any, noop as any,
      { add: jest.fn() } as any, { add: jest.fn() } as any, { add: jest.fn() } as any,
    );
    return { svc, prisma };
  }

  it("returns the sequence the atomic counter yields", async () => {
    const { svc, prisma } = make();
    prisma.$queryRaw.mockResolvedValue([{ last: 42 }]);
    const seq = await (svc as any).nextInvoiceSequence(2026);
    expect(seq).toBe(42);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("does NOT fall back to a COUNT()-based sequence", async () => {
    const { svc, prisma } = make();
    prisma.invoice = { count: jest.fn() };
    prisma.$queryRaw.mockResolvedValue([{ last: 1 }]);
    await (svc as any).nextInvoiceSequence(2026);
    expect(prisma.invoice.count).not.toHaveBeenCalled();
  });

  it("coerces a bigint counter value to a number", async () => {
    const { svc, prisma } = make();
    prisma.$queryRaw.mockResolvedValue([{ last: 7n as unknown as number }]);
    const seq = await (svc as any).nextInvoiceSequence(2026);
    expect(seq).toBe(7);
    expect(typeof seq).toBe("number");
  });
});
