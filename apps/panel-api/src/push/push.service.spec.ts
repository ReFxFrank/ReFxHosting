import { PushService, PushMessage } from './push.service';

/**
 * Unit coverage for the parts that don't touch a live APNs socket: the payload
 * shape the iOS app routes on, token persistence, and the disabled-when-
 * unconfigured guard. HTTP/2 delivery is exercised in integration, not here.
 */
describe('PushService', () => {
  function make(apns: Record<string, unknown>) {
    const prisma = {
      pushToken: {
        upsert: jest.fn().mockResolvedValue(undefined),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const config = { get: (key: string) => (key === 'apns' ? apns : undefined) };
    return { prisma, svc: new PushService(config as any, prisma as any) };
  }

  const configured = {
    keyP8: '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----',
    keyId: 'KID', teamId: 'TID', bundleId: 'com.refx.app', production: false,
  };
  const disabled = { keyP8: '', keyId: '', teamId: '', bundleId: '', production: false };

  it('puts type + id fields at the TOP LEVEL, alongside aps', () => {
    const { svc } = make(configured);
    const msg: PushMessage = {
      title: 'T', body: 'B', badge: 3, type: 'server.state', data: { serverId: 's-1' },
    };
    const payload = (svc as any).buildPayload(msg);
    expect(payload).toEqual({
      aps: { alert: { title: 'T', body: 'B' }, sound: 'default', badge: 3 },
      type: 'server.state',
      serverId: 's-1',
    });
  });

  it('omits badge when not provided', () => {
    const { svc } = make(configured);
    const payload = (svc as any).buildPayload({ title: 'T', body: 'B', type: 'billing.invoice' });
    expect(payload.aps.badge).toBeUndefined();
    expect(payload.aps).toEqual({ alert: { title: 'T', body: 'B' }, sound: 'default' });
  });

  it('upserts on the unique token, moving it to the caller', async () => {
    const { svc, prisma } = make(configured);
    await svc.registerToken('u-1', '  abc  ', 'ios');
    expect(prisma.pushToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: 'abc' },
        update: { userId: 'u-1', platform: 'ios' },
        create: expect.objectContaining({ userId: 'u-1', token: 'abc', platform: 'ios' }),
      }),
    );
  });

  it('register/remove are no-ops for blank tokens', async () => {
    const { svc, prisma } = make(configured);
    await svc.registerToken('u-1', '   ', 'ios');
    await svc.removeToken('u-1', '');
    expect(prisma.pushToken.upsert).not.toHaveBeenCalled();
    expect(prisma.pushToken.deleteMany).not.toHaveBeenCalled();
  });

  it('removes only a token owned by the caller', async () => {
    const { svc, prisma } = make(configured);
    await svc.removeToken('u-1', 'abc');
    expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({
      where: { token: 'abc', userId: 'u-1' },
    });
  });

  it('sendToUser is a no-op (no token lookup) when APNs is unconfigured', async () => {
    const { svc, prisma } = make(disabled);
    await svc.sendToUser('u-1', { title: 'T', body: 'B', type: 'support.reply' });
    expect(prisma.pushToken.findMany).not.toHaveBeenCalled();
  });
});
