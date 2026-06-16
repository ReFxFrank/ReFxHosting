import { AlertsService } from './alerts.service';

/**
 * Unit tests for AlertsService — the platform banners shown on every user's
 * client-area dashboard. Prisma is mocked.
 *
 * Guards under test:
 *   - listActiveAlerts() filters by isActive AND the start/end visibility window
 *     (a null bound = unbounded), so a freshly-posted dateless alert is returned;
 *   - createAlert() persists isActive (the field the admin form sends), defaulting
 *     to the schema default when omitted.
 */
describe('AlertsService', () => {
  let prisma: any;
  let service: AlertsService;

  beforeEach(() => {
    prisma = {
      globalAlert: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'a-1', ...data })),
      },
    };
    service = new AlertsService(prisma);
  });

  it('listActiveAlerts only requests active alerts within their window', async () => {
    await service.listActiveAlerts();
    const where = prisma.globalAlert.findMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    // start bound: null OR <= now ; end bound: null OR >= now
    expect(where.AND).toHaveLength(2);
    expect(where.AND[0].OR[0]).toEqual({ startsAt: null });
    expect(where.AND[1].OR[0]).toEqual({ endsAt: null });
  });

  it('createAlert persists isActive (defaults to undefined → schema default)', async () => {
    await service.createAlert({ title: 'Maintenance', body: 'Tonight' } as any);
    const data = prisma.globalAlert.create.mock.calls[0][0].data;
    expect(data.title).toBe('Maintenance');
    expect('isActive' in data).toBe(true); // passed through (undefined → DB default true)
  });

  it('createAlert honours an explicit isActive=false', async () => {
    await service.createAlert({ title: 'Draft', body: 'x', isActive: false } as any);
    const data = prisma.globalAlert.create.mock.calls[0][0].data;
    expect(data.isActive).toBe(false);
  });
});
