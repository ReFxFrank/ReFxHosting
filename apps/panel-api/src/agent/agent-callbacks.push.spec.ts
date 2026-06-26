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
    );
    return { prisma, push, ctrl };
  }

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
});
