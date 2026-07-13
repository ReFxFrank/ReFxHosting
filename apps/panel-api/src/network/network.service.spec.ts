import { NetworkService } from "./network.service";

/**
 * Exercises the metric aggregation in overview() against a synthetic probe
 * window — the loss %, latency, jitter, and health derivation that would
 * silently mislead an operator if the math were off.
 */
function makeService(window: { ms: number | null; ok: boolean }[], node: any) {
  const prisma = {
    node: { findMany: jest.fn().mockResolvedValue([node]) },
  } as any;
  const redis = {
    client: {
      // stored newest-first; overview reverses to chronological
      lrange: jest
        .fn()
        .mockResolvedValue(
          [...window].reverse().map((s) => JSON.stringify({ t: 0, ...s })),
        ),
    },
  } as any;
  const nodes = {} as any;
  return new NetworkService(prisma, redis, nodes);
}

const baseNode = {
  id: "n1",
  name: "node-1",
  state: "RUNNING",
  region: { name: "EU" },
  heartbeats: [],
};

describe("NetworkService.overview", () => {
  it("computes loss %, uptime, latency and jitter from the window", async () => {
    const window = [
      { ms: 20, ok: true },
      { ms: 24, ok: true },
      { ms: null, ok: false }, // one dropped probe
      { ms: 22, ok: true },
      { ms: 30, ok: true },
    ];
    const svc = makeService(window, baseNode);
    const { nodes, rollup } = await svc.overview();
    const n = nodes[0];
    expect(n.samples).toBe(5);
    expect(n.lossPct).toBe(20); // 1 of 5 failed
    expect(n.uptimePct).toBe(80);
    expect(n.latencyMs).toBe(30); // most recent successful
    expect(n.avgMs).toBe(24); // (20+24+22+30)/4
    expect(n.jitterMs).toBeGreaterThan(0);
    expect(rollup.worstLossPct).toBe(20);
  });

  it("flags degraded on high loss and down on an offline node", async () => {
    const lossy = Array.from({ length: 10 }, (_, i) => ({
      ms: i < 8 ? 50 : null,
      ok: i < 8,
    })); // 20% loss
    const degraded = await makeService(lossy, baseNode).overview();
    expect(degraded.nodes[0].health).toBe("degraded");

    const offline = await makeService(
      [{ ms: 10, ok: true }],
      { ...baseNode, state: "OFFLINE" },
    ).overview();
    expect(offline.nodes[0].health).toBe("down");
  });

  it("reports a healthy node with an empty window as 100% uptime", async () => {
    const svc = makeService([], baseNode);
    const n = (await svc.overview()).nodes[0];
    expect(n.health).toBe("healthy");
    expect(n.lossPct).toBe(0);
    expect(n.uptimePct).toBe(100);
    expect(n.latencyMs).toBeNull();
  });

  it("derives throughput Mbps from two heartbeat counters", async () => {
    const node = {
      ...baseNode,
      heartbeats: [
        { netRxBytes: 12_500_000n, netTxBytes: 2_500_000n, recordedAt: new Date(10_000) },
        { netRxBytes: 0n, netTxBytes: 0n, recordedAt: new Date(0) },
      ],
    };
    const n = (await makeService([{ ms: 5, ok: true }], node).overview()).nodes[0];
    // 12.5 MB over 10s = 10 Mbps rx; 2.5 MB = 2 Mbps tx
    expect(n.rxMbps).toBe(10);
    expect(n.txMbps).toBe(2);
  });
});
