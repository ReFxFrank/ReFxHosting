import { StatusService } from './status.service';

/**
 * The public status rollup: node state + heartbeat freshness → region status →
 * overall. Pure logic over a mocked node query; no DB.
 */
describe('StatusService.getStatus', () => {
  const fresh = new Date(Date.now() - 60 * 1000).toISOString(); // 1m ago
  const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10m ago

  beforeEach(() => {
    // Web health ping defaults to OK so node assertions aren't masked by it.
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
  });

  function svc(nodes: unknown[], active: unknown[] = []) {
    const prisma = { node: { findMany: jest.fn().mockResolvedValue(nodes) } };
    const config = { get: jest.fn().mockReturnValue({ healthUrl: 'http://web/api/health' }) };
    const incidents = {
      activeIncidents: jest.fn().mockResolvedValue(active),
      listPublic: jest.fn().mockResolvedValue({ active: [], recent: [] }),
    };
    return new StatusService(prisma as any, config as any, incidents as any);
  }
  const node = (
    state: string,
    opts: { region?: string; hb?: string | null; maintenance?: boolean; name?: string } = {},
  ) => ({
    name: opts.name ?? 'node-1',
    state,
    maintenance: opts.maintenance ?? false,
    region: {
      code: opts.region ?? 'us',
      name: (opts.region ?? 'us').toUpperCase(),
      country: 'US',
    },
    heartbeats: opts.hb === null || opts.hb === undefined ? [] : [{ recordedAt: opts.hb }],
  });

  it('reports operational when all nodes are ONLINE with fresh heartbeats', async () => {
    const s = await svc([node('ONLINE', { hb: fresh }), node('ONLINE', { hb: fresh })]).getStatus();
    expect(s.status).toBe('operational');
    expect(s.regions[0].status).toBe('operational');
    expect(s.components.find((c) => c.key === 'panel-api')?.status).toBe('operational');
    expect(s.components.find((c) => c.key === 'web')?.status).toBe('operational');
  });

  it('marks the Web Dashboard as outage (and overall) when the web ping fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    const s = await svc([node('ONLINE', { hb: fresh })]).getStatus();
    expect(s.components.find((c) => c.key === 'web')?.status).toBe('outage');
    expect(s.status).toBe('outage');
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
    expect(s.components).toHaveLength(4); // panel-api, web, nodes, ios-app
    expect(s.components.find((c) => c.key === 'ios-app')?.status).toBe('operational');
  });

  it('lets an active incident drive a component status (e.g. iOS App outage)', async () => {
    const s = await svc(
      [node('ONLINE', { hb: fresh })],
      [{ impact: 'OUTAGE', components: ['ios-app'] }],
    ).getStatus();
    expect(s.components.find((c) => c.key === 'ios-app')?.status).toBe('outage');
    expect(s.status).toBe('outage');
    // Components without the incident stay healthy.
    expect(s.components.find((c) => c.key === 'nodes')?.status).toBe('operational');
  });
});
