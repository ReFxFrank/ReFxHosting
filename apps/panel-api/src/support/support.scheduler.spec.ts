import { SupportScheduler } from './support.scheduler';

/**
 * Auto-resolve (PENDING_CUSTOMER -> RESOLVED) and auto-close (RESOLVED ->
 * CLOSED) of stale tickets, with multi-instance-safe conditional updates.
 */
describe('SupportScheduler', () => {
  function make(
    cfg: Partial<{
      autoResolveEnabled: boolean;
      autoResolveDays: number;
      autoCloseDays: number;
    }> = {},
  ) {
    const support = {
      autoResolveEnabled: true,
      autoResolveDays: 7,
      autoCloseDays: 3,
      ...cfg,
    };
    const prisma = {
      ticket: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const notifications = { createNotification: jest.fn().mockResolvedValue({}) };
    const config = { get: jest.fn().mockReturnValue(support) };
    const svc = new SupportScheduler(
      prisma as any,
      notifications as any,
      config as any,
    );
    return { svc, prisma, notifications };
  }

  it('auto-resolves stale PENDING_CUSTOMER tickets and notifies the requester', async () => {
    const { svc, prisma, notifications } = make();
    prisma.ticket.findMany.mockResolvedValue([
      { id: 't1', number: 12, subject: 'Help', requesterId: 'c1' },
    ]);
    prisma.ticket.updateMany.mockResolvedValue({ count: 1 });

    const n = await svc.autoResolveStale();

    expect(n).toBe(1);
    // Conditional update guards on the state still being PENDING_CUSTOMER.
    expect(prisma.ticket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 't1', state: 'PENDING_CUSTOMER' }),
        data: expect.objectContaining({ state: 'RESOLVED' }),
      }),
    );
    expect(notifications.createNotification).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ title: expect.stringContaining('#12') }),
    );
  });

  it('does NOT notify when another instance already handled the ticket (count 0)', async () => {
    const { svc, prisma, notifications } = make();
    prisma.ticket.findMany.mockResolvedValue([
      { id: 't1', number: 1, subject: 'x', requesterId: 'c1' },
    ]);
    prisma.ticket.updateMany.mockResolvedValue({ count: 0 });
    const n = await svc.autoResolveStale();
    expect(n).toBe(0);
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  it('auto-closes stale RESOLVED tickets in bulk', async () => {
    const { svc, prisma } = make();
    prisma.ticket.updateMany.mockResolvedValue({ count: 4 });
    const n = await svc.autoCloseResolved();
    expect(n).toBe(4);
    expect(prisma.ticket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ state: 'RESOLVED' }),
        data: { state: 'CLOSED' },
      }),
    );
  });

  it('skips a stage when its day threshold is 0', async () => {
    const { svc, prisma } = make({ autoResolveDays: 0, autoCloseDays: 0 });
    expect(await svc.autoResolveStale()).toBe(0);
    expect(await svc.autoCloseResolved()).toBe(0);
    expect(prisma.ticket.findMany).not.toHaveBeenCalled();
    expect(prisma.ticket.updateMany).not.toHaveBeenCalled();
  });

  it('sweep is a no-op when disabled', async () => {
    const { svc, prisma } = make({ autoResolveEnabled: false });
    await svc.sweep();
    expect(prisma.ticket.findMany).not.toHaveBeenCalled();
    expect(prisma.ticket.updateMany).not.toHaveBeenCalled();
  });
});
