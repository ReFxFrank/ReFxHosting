import { NodesService, NODE_OFFLINE_AFTER_MS } from "./nodes.service";

/**
 * Node liveness sweep: heartbeats mark a node ONLINE, the sweep is the
 * counterpart that marks it OFFLINE once heartbeats stop, so the admin badge
 * and the placement scheduler stop trusting a dead node.
 */
describe("NodesService.sweepOfflineNodes", () => {
  const makeSvc = (prisma: any) => {
    const crypto = { token: jest.fn(), hash: jest.fn() } as any;
    const config = { get: jest.fn().mockReturnValue("0".repeat(64)) } as any;
    return new NodesService(prisma, crypto, {} as any, config);
  };

  it("marks ONLINE nodes with stale heartbeats OFFLINE (only those)", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const svc = makeSvc({ node: { updateMany } });

    const before = Date.now();
    const count = await svc.sweepOfflineNodes();
    expect(count).toBe(2);

    const arg = updateMany.mock.calls[0][0];
    // Scoped to live, currently-ONLINE nodes — OFFLINE untouched, and
    // maintenance nodes excluded via the BOOLEAN (the field the admin UI
    // sets; their state stays whatever it was).
    expect(arg.where.state).toBe("ONLINE");
    expect(arg.where.maintenance).toBe(false);
    expect(arg.where.deletedAt).toBeNull();
    expect(arg.data).toEqual({ state: "OFFLINE" });
    // Never flips a freshly-registered node that simply hasn't heartbeated
    // YET: it must have prior heartbeats, or a registration older than the
    // window.
    expect(arg.where.OR).toEqual([
      { heartbeats: { some: {} } },
      { bootstrapTokenUsedAt: { lt: expect.any(Date) } },
    ]);
    // Only nodes with NO heartbeat inside the liveness window.
    const cutoff = arg.where.heartbeats.none.recordedAt.gte as Date;
    expect(before - cutoff.getTime()).toBeGreaterThanOrEqual(
      NODE_OFFLINE_AFTER_MS - 1000,
    );
    expect(before - cutoff.getTime()).toBeLessThanOrEqual(
      NODE_OFFLINE_AFTER_MS + 1000,
    );
  });

  it("is quiet when nothing is stale", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const svc = makeSvc({ node: { updateMany } });
    await expect(svc.sweepOfflineNodes()).resolves.toBe(0);
  });
});
