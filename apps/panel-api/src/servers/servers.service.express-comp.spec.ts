import { ServersService } from "./servers.service";

/**
 * Admin comp of the Express Backups (R2) add-on: enables offsite routing with
 * no charge. Comp is orthogonal to the paid flag — routing = paid || comp, and
 * billing (the per-cycle line) keys on the paid flag only.
 */
describe("ServersService.setExpressBackupsComp", () => {
  let prisma: any;
  let service: ServersService;

  const makeService = () =>
    new ServersService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { add: jest.fn() } as any,
      { add: jest.fn() } as any,
      { add: jest.fn() } as any,
    );

  const withSub = (paid: boolean) => ({
    id: "srv-1",
    subscriptionId: "sub-1",
    subscription: { id: "sub-1", expressBackups: paid },
  });

  beforeEach(() => {
    const tx: any[] = [];
    prisma = {
      server: { findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      subscription: { update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => {
        tx.push(...ops);
        return Promise.all(ops);
      }),
    };
    service = makeService();
  });

  it("comps: routes offsite without charge (comp flag set, server routing on)", async () => {
    prisma.server.findFirst.mockResolvedValue(withSub(false));
    const res = await service.setExpressBackupsComp("srv-1", true);

    expect(res).toEqual({ expressBackups: true, comped: true, paid: false });
    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub-1" },
        data: { expressBackupsComp: true },
      }),
    );
    expect(prisma.server.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { subscriptionId: "sub-1", deletedAt: null },
        data: { expressBackups: true },
      }),
    );
  });

  it("un-comps a non-paying sub: routing reverts to local", async () => {
    prisma.server.findFirst.mockResolvedValue(withSub(false));
    const res = await service.setExpressBackupsComp("srv-1", false);
    expect(res).toEqual({ expressBackups: false, comped: false, paid: false });
    expect(prisma.server.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { expressBackups: false } }),
    );
  });

  it("un-comping a PAYING sub keeps offsite routing (paid wins)", async () => {
    prisma.server.findFirst.mockResolvedValue(withSub(true));
    const res = await service.setExpressBackupsComp("srv-1", false);
    expect(res).toEqual({ expressBackups: true, comped: false, paid: true });
    expect(prisma.server.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { expressBackups: true } }),
    );
  });

  it("rejects a server with no subscription", async () => {
    prisma.server.findFirst.mockResolvedValue({
      id: "srv-1",
      subscriptionId: null,
      subscription: null,
    });
    await expect(service.setExpressBackupsComp("srv-1", true)).rejects.toThrow();
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it("404s an unknown server", async () => {
    prisma.server.findFirst.mockResolvedValue(null);
    await expect(service.setExpressBackupsComp("nope", true)).rejects.toThrow();
  });
});
