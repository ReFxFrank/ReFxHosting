import { AgentCallbacksController } from './agent-callbacks.controller';

/**
 * The server-state → APNs push wiring inside applyServerState. Guards against a
 * refactor silently dropping the push (the service itself is tested separately;
 * this proves the EVENT actually calls it, with the right type/serverId, and
 * that the unchanged-state and 30-min throttle guards behave.)
 */
describe('AgentCallbacksController server-state push', () => {
  function make() {
    const prisma = {
      server: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const push = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    const notifications = { createNotification: jest.fn().mockResolvedValue(undefined) };
    const ctrl = new AgentCallbacksController(
      prisma as any,
      {} as any,
      notifications as any,
      push as any,
      {} as any,
      {} as any,
    );
    return { prisma, push, notifications, ctrl };
  }

  const crashRows = (notifications: { createNotification: jest.Mock }) =>
    notifications.createNotification.mock.calls.filter((c) =>
      String(c[1]?.body ?? '').includes('has crashed'),
    );

  it('pushes server.state + serverId when a server transitions to OFFLINE', async () => {
    const { prisma, push, ctrl } = make();
    prisma.server.findUnique.mockResolvedValue({ ownerId: 'u1', name: 'My SMP', state: 'STOPPING' });
    await (ctrl as any).applyServerState('s1', 'OFFLINE');
    expect(push.sendToUser).toHaveBeenCalledTimes(1);
    expect(push.sendToUser).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        type: 'server.state',
        data: { serverId: 's1' },
        body: expect.stringContaining('offline'),
      }),
    );
  });

  it('does not push when the state is unchanged', async () => {
    const { prisma, push, ctrl } = make();
    prisma.server.findUnique.mockResolvedValue({ ownerId: 'u1', name: 'x', state: 'OFFLINE' });
    await (ctrl as any).applyServerState('s1', 'OFFLINE');
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('does not push for a non-push-worthy state (STARTING)', async () => {
    const { prisma, push, ctrl } = make();
    prisma.server.findUnique.mockResolvedValue({ ownerId: 'u1', name: 'x', state: 'OFFLINE' });
    await (ctrl as any).applyServerState('s1', 'STARTING');
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('throttles a repeated same-state push within the window', async () => {
    const { prisma, push, ctrl } = make();
    // Both calls observe RUNNING -> OFFLINE (update is mocked, so no real persist);
    // the in-memory throttle must suppress the second.
    prisma.server.findUnique
      .mockResolvedValueOnce({ ownerId: 'u1', name: 'x', state: 'RUNNING' })
      .mockResolvedValueOnce({ ownerId: 'u1', name: 'x', state: 'RUNNING' });
    await (ctrl as any).applyServerState('s1', 'OFFLINE');
    await (ctrl as any).applyServerState('s1', 'OFFLINE');
    expect(push.sendToUser).toHaveBeenCalledTimes(1);
  });

  // The desktop app reads the in-app notification feed (createNotification), not
  // push, so online/offline must now write feed rows for start/restart parity.
  it('writes an in-app feed row when a server comes online (start/restart parity)', async () => {
    const { prisma, notifications, ctrl } = make();
    prisma.server.findUnique.mockResolvedValue({ ownerId: 'u1', name: 'My SMP', state: 'STARTING' });
    await (ctrl as any).applyServerState('s1', 'RUNNING');
    expect(notifications.createNotification).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ body: expect.stringContaining('is now online') }),
    );
  });

  it('writes an in-app feed row when a server goes offline', async () => {
    const { prisma, notifications, ctrl } = make();
    prisma.server.findUnique.mockResolvedValue({ ownerId: 'u1', name: 'x', state: 'RUNNING' });
    await (ctrl as any).applyServerState('s1', 'OFFLINE');
    expect(notifications.createNotification).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ body: expect.stringContaining('is now offline') }),
    );
  });

  // Regression: a crash-loop (crash -> auto-restart online -> crash again) within
  // the 30-min window used to write only ONE crash feed row, because the feed
  // throttle stayed armed on CRASHED while push re-armed on the online. Now that
  // RUNNING is notice-worthy it re-arms the feed throttle too, so the repeat
  // crash gets a fresh row — the desktop no longer misses repeat crashes.
  it('writes a fresh crash feed row after an intervening online (throttle re-armed)', async () => {
    const { prisma, notifications, ctrl } = make();
    prisma.server.findUnique
      .mockResolvedValueOnce({ ownerId: 'u1', name: 'x', state: 'RUNNING' }) // -> CRASHED
      .mockResolvedValueOnce({ ownerId: 'u1', name: 'x', state: 'CRASHED' }) // -> RUNNING
      .mockResolvedValueOnce({ ownerId: 'u1', name: 'x', state: 'RUNNING' }); // -> CRASHED again
    await (ctrl as any).applyServerState('s1', 'CRASHED');
    await (ctrl as any).applyServerState('s1', 'RUNNING');
    await (ctrl as any).applyServerState('s1', 'CRASHED');
    expect(crashRows(notifications)).toHaveLength(2);
  });

  it('still throttles a repeat crash with NO intervening online', async () => {
    const { prisma, notifications, ctrl } = make();
    prisma.server.findUnique
      .mockResolvedValueOnce({ ownerId: 'u1', name: 'x', state: 'RUNNING' }) // -> CRASHED
      .mockResolvedValueOnce({ ownerId: 'u1', name: 'x', state: 'STARTING' }); // -> CRASHED (no RUNNING between)
    await (ctrl as any).applyServerState('s1', 'CRASHED');
    await (ctrl as any).applyServerState('s1', 'CRASHED');
    expect(crashRows(notifications)).toHaveLength(1);
  });
});
