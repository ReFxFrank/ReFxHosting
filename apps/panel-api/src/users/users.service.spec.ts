import { UsersService } from './users.service';

// A profile row as getProfile would return it (secrets already omitted).
const baseProfile = {
  id: 'u-1',
  email: 'c@e.com',
  globalRole: 'CUSTOMER',
  state: 'ACTIVE',
  timezone: 'UTC',
  deletedAt: null,
} as any;

function make(profileOverrides: Record<string, unknown> = {}) {
  const prisma: any = {
    user: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ ...baseProfile, ...profileOverrides }),
      update: jest
        .fn()
        .mockImplementation(async ({ data }: any) => ({ ...baseProfile, ...data })),
    },
    schedule: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const svc = new UsersService(prisma as any);
  return { svc, prisma };
}

describe('UsersService.updateProfile — timezone recompute', () => {
  it('recomputes nextRunAt for the owner’s active schedules when the timezone changes', async () => {
    const { svc, prisma } = make({ timezone: 'UTC' });
    prisma.schedule.findMany.mockResolvedValue([
      { id: 's-1', cron: '0 4 * * *' },
      { id: 's-2', cron: '0 4 * * *' },
    ]);

    await svc.updateProfile('u-1', { timezone: 'America/New_York' } as any);

    // Only the owner's active, non-deleted schedules are considered.
    expect(prisma.schedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          server: { ownerId: 'u-1', deletedAt: null },
        },
      }),
    );
    // Each schedule got a fresh nextRunAt.
    expect(prisma.schedule.update).toHaveBeenCalledTimes(2);
    const firstUpdate = prisma.schedule.update.mock.calls[0][0];
    expect(firstUpdate.where.id).toBe('s-1');
    expect(firstUpdate.data.nextRunAt).toBeInstanceOf(Date);
  });

  it('does not touch schedules when the timezone is unchanged', async () => {
    const { svc, prisma } = make({ timezone: 'America/New_York' });
    await svc.updateProfile('u-1', { timezone: 'America/New_York' } as any);
    expect(prisma.schedule.findMany).not.toHaveBeenCalled();
    expect(prisma.schedule.update).not.toHaveBeenCalled();
  });

  it('does not touch schedules when the update omits timezone', async () => {
    const { svc, prisma } = make({ timezone: 'UTC' });
    await svc.updateProfile('u-1', { firstName: 'Frank' } as any);
    expect(prisma.schedule.findMany).not.toHaveBeenCalled();
  });

  it('nextRunAt lands at the requested local hour (4am), not UTC 4am', async () => {
    const { svc, prisma } = make({ timezone: 'UTC' });
    prisma.schedule.findMany.mockResolvedValue([{ id: 's-1', cron: '0 4 * * *' }]);

    await svc.updateProfile('u-1', { timezone: 'America/New_York' } as any);

    const next: Date = prisma.schedule.update.mock.calls[0][0].data.nextRunAt;
    // 04:00 America/New_York is 08:00 or 09:00 UTC (DST-dependent) — never 04:00 UTC.
    const hourInNy = Number(
      next.toLocaleString('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        hour12: false,
      }),
    );
    expect(hourInNy % 24).toBe(4);
  });
});
