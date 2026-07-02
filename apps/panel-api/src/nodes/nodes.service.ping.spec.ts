import { NodesService } from "./nodes.service";

/**
 * Panel→agent ping methodology: one untimed warm-up request (pays DNS/TCP/TLS
 * so we don't report connection setup as latency), then the minimum of three
 * timed samples over the warm connection.
 */
describe("NodesService.ping", () => {
  const NODE = {
    id: "node-1",
    deletedAt: null,
    heartbeats: [{ recordedAt: new Date(Date.now() - 5_000) }],
  };

  const makeSvc = (agent: any) => {
    const prisma = {
      node: { findFirst: jest.fn().mockResolvedValue(NODE) },
    } as any;
    const crypto = { token: jest.fn(), hash: jest.fn() } as any;
    const config = { get: jest.fn().mockReturnValue("0".repeat(64)) } as any;
    return new NodesService(prisma, crypto, agent, config);
  };

  it("warms up untimed, then reports the min of 3 timed samples", async () => {
    const agent = { fetchAgentStatus: jest.fn().mockResolvedValue({}) };
    const svc = makeSvc(agent);
    const res = await svc.ping("node-1");
    // 1 warm-up + 3 samples.
    expect(agent.fetchAgentStatus).toHaveBeenCalledTimes(4);
    expect(res.reachable).toBe(true);
    expect(res.ms).toBeGreaterThanOrEqual(1);
    expect(res.heartbeatAgeMs).toBeGreaterThan(0);
  });

  it("returns unreachable (ms null) when the agent can't be reached", async () => {
    const agent = {
      fetchAgentStatus: jest.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    };
    const svc = makeSvc(agent);
    const res = await svc.ping("node-1");
    expect(res).toMatchObject({ ms: null, reachable: false });
    // Fails fast on the warm-up — no pointless timed samples after.
    expect(agent.fetchAgentStatus).toHaveBeenCalledTimes(1);
  });
});
