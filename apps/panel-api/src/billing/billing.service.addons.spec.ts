import { BillingService } from "./billing.service";

/**
 * Add-on invoice lines. The rule both comps depend on: a comp grants the
 * add-on but NEVER bills for it, so only the paid field may reach an invoice
 * line. Prisma, settings and notifications are mocked; the assertions are on
 * the line items handed to invoice.create.
 */
describe("BillingService add-on invoice lines", () => {
  function make(subOver: Record<string, unknown> = {}) {
    const prisma: any = {
      subscription: {
        findUnique: jest.fn().mockResolvedValue({
          id: "sub-1",
          userId: "u-1",
          priceId: "price-1",
          interval: "MONTHLY",
          slots: 1,
          gateway: "stripe",
          currentPeriodEnd: new Date("2026-09-01T00:00:00Z"),
          expressBackups: false,
          expressBackupsComp: false,
          headlessClients: 0,
          headlessClientsComp: 0,
          product: { name: "Arma 3", perSlot: false },
          user: {},
          hardwareTier: null,
          ...subOver,
        }),
      },
      price: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "price-1", amountMinor: 1000, currency: "USD" }),
      },
      invoice: {
        create: jest.fn().mockResolvedValue({
          id: "inv-1",
          dueAt: null,
          lineItems: [],
        }),
      },
    };
    const config = {
      get: jest.fn((k: string) =>
        k === "billing"
          ? {
              defaultCurrency: "USD",
              invoiceNumberPrefix: "INV",
              schedulerEnabled: false,
            }
          : "http://localhost:3000",
      ),
    };
    const settings = {
      expressBackupsConfig: jest
        .fn()
        .mockResolvedValue({ enabled: true, monthlyMinor: 300 }),
      headlessClientsConfig: jest
        .fn()
        .mockResolvedValue({ enabled: true, monthlyMinor: 400 }),
    };
    const notifications = { createNotification: jest.fn() };
    const push = { sendToUser: jest.fn() };
    const svc = new BillingService(
      prisma as any,
      config as any,
      { name: "stripe" } as any,
      { name: "paypal" } as any,
      settings as any,
      {} as any,
      {} as any,
      notifications as any,
      push as any,
      { add: jest.fn() } as any,
      { add: jest.fn() } as any,
      { add: jest.fn() } as any,
    );
    jest.spyOn(svc as any, "nextInvoiceSequence").mockResolvedValue(1);
    jest
      .spyOn(svc as any, "invoiceLineDescription")
      .mockReturnValue("Arma 3 — monthly");
    return { svc, prisma };
  }

  /** Descriptions of the line items invoice.create was called with. */
  async function linesFor(subOver: Record<string, unknown> = {}) {
    const { svc, prisma } = make(subOver);
    await svc.createInvoiceForSubscription("sub-1", { noTax: true });
    const args = prisma.invoice.create.mock.calls[0][0];
    return args.data.lineItems.create as {
      description: string;
      amountMinor: number;
    }[];
  }

  it("bills the purchased headless clients", async () => {
    const lines = await linesFor({ headlessClients: 2 });
    expect(lines).toContainEqual(
      expect.objectContaining({
        description: "Headless clients × 2 — Arma AI offload",
        amountMinor: 800,
      }),
    );
  });

  it("never bills a comped headless client", async () => {
    const lines = await linesFor({ headlessClients: 0, headlessClientsComp: 3 });
    expect(lines).toHaveLength(1); // the plan line only
    expect(
      lines.some((l) => l.description.startsWith("Headless clients")),
    ).toBe(false);
  });

  it("bills only the paid part when a comp tops the count up", async () => {
    const lines = await linesFor({ headlessClients: 1, headlessClientsComp: 3 });
    expect(lines).toContainEqual(
      expect.objectContaining({
        description: "Headless clients × 1 — Arma AI offload",
        amountMinor: 400,
      }),
    );
  });

  it("never bills comped express backups", async () => {
    const lines = await linesFor({
      expressBackups: false,
      expressBackupsComp: true,
    });
    expect(lines).toHaveLength(1);
  });
});
