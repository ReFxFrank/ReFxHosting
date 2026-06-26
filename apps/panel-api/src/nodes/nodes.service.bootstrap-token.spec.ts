import { BadRequestException } from '@nestjs/common';
import { NodesService } from './nodes.service';

/**
 * Bootstrap-token lifecycle: the token that yields a node's signing key is
 * single-use and time-boxed. registerAgentByToken must reject expired/used
 * tokens and consume a fresh one; regenerateBootstrap re-arms it.
 */
describe('NodesService bootstrap token lifecycle', () => {
  let prisma: any;
  let crypto: any;
  let svc: NodesService;

  // Deterministic hash so we can match a token to a stored node row.
  const hash = (s: string) => `h(${s})`;
  const TOKEN = 'boot-token';
  const TOKEN_HASH = hash(TOKEN);

  beforeEach(() => {
    prisma = {
      node: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      server: { findMany: jest.fn().mockResolvedValue([]) },
    };
    crypto = {
      token: jest.fn(() => 'NEW-TOKEN'),
      hash: jest.fn(hash),
    };
    const agent = {} as any;
    const config = { get: jest.fn().mockReturnValue('0'.repeat(64)) } as any;
    svc = new NodesService(prisma, crypto, agent, config);
  });

  const baseNode = (over: Record<string, unknown> = {}) => ({
    id: 'node-1',
    name: 'n1',
    os: 'LINUX',
    sftpPort: 2022,
    daemonPort: 8443,
    agentVersion: null,
    tokenHash: TOKEN_HASH,
    bootstrapTokenExpiresAt: new Date(Date.now() + 60_000),
    bootstrapTokenUsedAt: null,
    ...over,
  });

  it('succeeds for a fresh token and marks it used', async () => {
    prisma.node.findFirst.mockResolvedValue(baseNode());
    const result = await svc.registerAgentByToken({ bootstrapToken: TOKEN });
    expect(result.nodeId).toBe('node-1');
    expect(result.signingKey).toBeTruthy();
    // The consume must stamp bootstrapTokenUsedAt atomically, guarded on the
    // token still being unused (single-use under concurrency).
    expect(prisma.node.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'node-1', bootstrapTokenUsedAt: null },
        data: expect.objectContaining({
          state: 'ONLINE',
          bootstrapTokenUsedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('rejects an already-used token', async () => {
    prisma.node.findFirst.mockResolvedValue(
      baseNode({ bootstrapTokenUsedAt: new Date(Date.now() - 1000) }),
    );
    await expect(
      svc.registerAgentByToken({ bootstrapToken: TOKEN }),
    ).rejects.toThrow(/already used/);
    expect(prisma.node.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a concurrent loser of the consume race (0 rows updated)', async () => {
    prisma.node.findFirst.mockResolvedValue(baseNode());
    prisma.node.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      svc.registerAgentByToken({ bootstrapToken: TOKEN }),
    ).rejects.toThrow(/already used/);
  });

  it('rejects an expired token', async () => {
    prisma.node.findFirst.mockResolvedValue(
      baseNode({ bootstrapTokenExpiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(
      svc.registerAgentByToken({ bootstrapToken: TOKEN }),
    ).rejects.toThrow(/expired/);
    expect(prisma.node.update).not.toHaveBeenCalled();
  });

  it('rejects an unknown token', async () => {
    prisma.node.findFirst.mockResolvedValue(null);
    await expect(
      svc.registerAgentByToken({ bootstrapToken: TOKEN }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('treats a null expiry (legacy row) as non-expiring', async () => {
    prisma.node.findFirst.mockResolvedValue(
      baseNode({ bootstrapTokenExpiresAt: null }),
    );
    const result = await svc.registerAgentByToken({ bootstrapToken: TOKEN });
    expect(result.nodeId).toBe('node-1');
  });

  it('regenerate mints a fresh token, sets a future expiry, and clears used', async () => {
    const { bootstrapToken, expiresAt } = await svc.regenerateBootstrap('node-1');
    expect(bootstrapToken).toBe('NEW-TOKEN');
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(prisma.node.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'node-1' },
        data: expect.objectContaining({
          tokenHash: hash('NEW-TOKEN'),
          bootstrapTokenUsedAt: null,
          bootstrapTokenExpiresAt: expect.any(Date),
        }),
      }),
    );
  });

  it('a regenerated token is then usable (used cleared)', async () => {
    // Simulate the post-regenerate row: fresh, unused, future expiry.
    prisma.node.findFirst.mockResolvedValue(
      baseNode({
        tokenHash: hash('NEW-TOKEN'),
        bootstrapTokenUsedAt: null,
        bootstrapTokenExpiresAt: new Date(Date.now() + 60_000),
      }),
    );
    const result = await svc.registerAgentByToken({ bootstrapToken: 'NEW-TOKEN' });
    expect(result.nodeId).toBe('node-1');
  });

  // The LEGACY register path (registerAgent by nodeId) must enforce the same
  // single-use + expiry lifecycle — it must not be a replay loophole.
  describe('registerAgent (legacy nodeId path)', () => {
    it('succeeds for a fresh token and consumes it atomically', async () => {
      prisma.node.findUnique = jest.fn().mockResolvedValue(baseNode());
      prisma.node.findUniqueOrThrow = jest.fn().mockResolvedValue(baseNode());
      const res = await svc.registerAgent('node-1', { bootstrapToken: TOKEN });
      expect(res.nodeId).toBe('node-1');
      expect(prisma.node.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'node-1', bootstrapTokenUsedAt: null },
          data: expect.objectContaining({ bootstrapTokenUsedAt: expect.any(Date) }),
        }),
      );
    });

    it('rejects an already-used token (no replay via the legacy path)', async () => {
      prisma.node.findUnique = jest
        .fn()
        .mockResolvedValue(baseNode({ bootstrapTokenUsedAt: new Date(Date.now() - 1000) }));
      await expect(
        svc.registerAgent('node-1', { bootstrapToken: TOKEN }),
      ).rejects.toThrow(/already used/);
      expect(prisma.node.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      prisma.node.findUnique = jest
        .fn()
        .mockResolvedValue(baseNode({ bootstrapTokenExpiresAt: new Date(Date.now() - 1000) }));
      await expect(
        svc.registerAgent('node-1', { bootstrapToken: TOKEN }),
      ).rejects.toThrow(/expired/);
    });
  });
});
