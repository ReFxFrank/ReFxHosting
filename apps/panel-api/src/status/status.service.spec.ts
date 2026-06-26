import { StatusService } from './status.service';

/**
 * The public status rollup: node state + heartbeat freshness → region status →
 * overall. Pure logic over a mocked node query; no DB.
 */
describe('StatusService.getStatus', () => {
  const fresh = new Date(Date.now() - 60 * 1000).toISOString(); // 1m ago
  const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10m ago

  function svc(nodes: unknown[]) {
    const prisma = { node: { findMany: jest.fn().mockResolvedValue(nodes) } };
    return new StatusService(prisma as any);
  }
  const node = (
    state: string,
    opts: { region?: string; hb?: string | null; maintenance?: boolean } = {},
  ) => ({
    state,
    maintenance: opts.maintenance ?? false,
    region: { code: opts.region ?? 'us', name: (opts.region ?? 'us').toUpperCase() },
    heartbeats: opts.hb === null || opts.hb === undefined ? [] : [{ recordedAt: opts.hb }],
  });

  it('reports operational when all nodes are ONLINE with fresh heartbeats', async () => {
    const s = await svc([node('ONLINE', { hb: fresh }), node('ONLINE', { hb: fresh })]).getStatus();
    expect(s.status).toBe('operational');
    expect(s.regions[0].status).toBe('operational');
    expect(s.components.find((c) => c.key === 'panel-api')?.status).toBe('operational');
  });

  it('degrades a region when one node is OFFLINE among healthy ones', async () => {
    const s = await svc([node('ONLINE', { hb: fresh }), node('OFFLINE')]).getStatus();
    expect(s.regions[0].status).toBe('degraded');
    expect(s.status).toBe('degraded');
  });

  it('reports outage when every node in a region is OFFLINE', async () => {
    const s = await svc([node('OFFLINE'), node('OFFLINE')]).getStatus();
    expect(s.regions[0].status).toBe('outage');
    expect(s.status).toBe('outage');
  });

  it('treats an ONLINE node with a stale heartbeat as degraded', async () => {
    const s = await svc([node('ONLINE', { hb: stale })]).getStatus();
    expect(s.regions[0].status).toBe('degraded');
  });

  it('reports maintenance when all nodes are in maintenance', async () => {
    const s = await svc([node('MAINTENANCE'), node('ONLINE', { hb: fresh, maintenance: true })]).getStatus();
    expect(s.regions[0].status).toBe('maintenance');
  });

  it('is operational with no nodes (panel API still up, no regions listed)', async () => {
    const s = await svc([]).getStatus();
    expect(s.status).toBe('operational');
    expect(s.regions).toHaveLength(0);
    expect(s.components).toHaveLength(2);
  });
});
