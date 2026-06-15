import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ServersService } from './servers.service';

/**
 * Focused unit tests for the game-switching orchestration in ServersService.
 * Prisma, the BullMQ queues, the agent client, NodesService and CryptoService
 * are all mocked — no DB/Redis/network involved.
 *
 * Guard conditions under test:
 *   - server must be stopped (OFFLINE/CRASHED),
 *   - cannot switch to the game already installed,
 *   - target template must exist,
 *   - target template must be on the funding product's allowedTemplateIds
 *     whitelist (empty whitelist = all allowed),
 *   - on success: writes a GameSwitchLog, repoints the server, clears variable
 *     overrides, moves to SWITCHING_GAME and enqueues a reinstall.
 */
describe('ServersService.switchGame', () => {
  let prisma: any;
  let reinstallQueue: { add: jest.Mock };
  let provisionQueue: { add: jest.Mock };
  let suspensionQueue: { add: jest.Mock };
  let service: ServersService;

  const SERVER_ID = 'srv-1';
  const ACTOR_ID = 'actor-1';
  const CURRENT_TEMPLATE_ID = 'tmpl-current';
  const TARGET_TEMPLATE_ID = 'tmpl-target';

  function makeServer(overrides: Partial<any> = {}) {
    return {
      id: SERVER_ID,
      state: 'OFFLINE',
      templateId: CURRENT_TEMPLATE_ID,
      memoryMb: 4096,
      deployMethod: 'DOCKER',
      template: { slug: 'minecraft' },
      subscription: {
        product: { allowedTemplateIds: [CURRENT_TEMPLATE_ID, TARGET_TEMPLATE_ID] },
      },
      ...overrides,
    };
  }

  function makeTarget(overrides: Partial<any> = {}) {
    return {
      id: TARGET_TEMPLATE_ID,
      slug: 'rust',
      version: '2.0.0',
      dockerImages: { default: 'ghcr.io/refx/rust:latest' },
      startupCommand: './RustDedicated',
      deployMethods: ['DOCKER'],
      recMemoryMb: 2048,
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = {
      server: { findFirst: jest.fn(), update: jest.fn((args: any) => args) },
      gameTemplate: { findUnique: jest.fn() },
      gameSwitchLog: { create: jest.fn((args: any) => args) },
      serverVariable: { deleteMany: jest.fn((args: any) => args) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    reinstallQueue = { add: jest.fn().mockResolvedValue(undefined) };
    provisionQueue = { add: jest.fn() };
    suspensionQueue = { add: jest.fn() };

    service = new ServersService(
      prisma,
      {} as any, // CryptoService — unused on this path
      {} as any, // NodesService — unused on this path
      {} as any, // NodeAgentClient — unused on this path
      { resolve: jest.fn(async (_s: any, v: any) => v ?? 'latest'), resolveByLoader: jest.fn(async (_l: any, v: any) => v ?? 'latest') } as any, // MinecraftResolverService
      provisionQueue as any,
      reinstallQueue as any,
      suspensionQueue as any,
    );
  });

  const dto = (over: Partial<any> = {}) => ({
    templateId: TARGET_TEMPLATE_ID,
    ...over,
  });

  it('throws NotFound when the server is missing', async () => {
    prisma.server.findFirst.mockResolvedValue(null);
    await expect(service.switchGame(SERVER_ID, ACTOR_ID, dto())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each(['RUNNING', 'STARTING', 'STOPPING', 'INSTALLING', 'SWITCHING_GAME', 'SUSPENDED'])(
    'refuses to switch while the server state is %s',
    async (state) => {
      prisma.server.findFirst.mockResolvedValue(makeServer({ state }));
      await expect(
        service.switchGame(SERVER_ID, ACTOR_ID, dto()),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(reinstallQueue.add).not.toHaveBeenCalled();
    },
  );

  it.each(['OFFLINE', 'CRASHED'])('allows switching from the stopped state %s', async (state) => {
    prisma.server.findFirst.mockResolvedValue(makeServer({ state }));
    prisma.gameTemplate.findUnique.mockResolvedValue(makeTarget());
    const res = await service.switchGame(SERVER_ID, ACTOR_ID, dto());
    expect(res.accepted).toBe(true);
  });

  it('rejects switching to the game already installed', async () => {
    prisma.server.findFirst.mockResolvedValue(makeServer());
    await expect(
      service.switchGame(SERVER_ID, ACTOR_ID, dto({ templateId: CURRENT_TEMPLATE_ID })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws NotFound when the target template does not exist', async () => {
    prisma.server.findFirst.mockResolvedValue(makeServer());
    prisma.gameTemplate.findUnique.mockResolvedValue(null);
    await expect(service.switchGame(SERVER_ID, ACTOR_ID, dto())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('forbids switching to a template not on the product whitelist', async () => {
    prisma.server.findFirst.mockResolvedValue(
      makeServer({
        subscription: { product: { allowedTemplateIds: [CURRENT_TEMPLATE_ID] } },
      }),
    );
    prisma.gameTemplate.findUnique.mockResolvedValue(makeTarget());
    await expect(service.switchGame(SERVER_ID, ACTOR_ID, dto())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(reinstallQueue.add).not.toHaveBeenCalled();
  });

  it('treats an empty whitelist as "all templates allowed"', async () => {
    prisma.server.findFirst.mockResolvedValue(
      makeServer({ subscription: { product: { allowedTemplateIds: [] } } }),
    );
    prisma.gameTemplate.findUnique.mockResolvedValue(makeTarget());
    const res = await service.switchGame(SERVER_ID, ACTOR_ID, dto());
    expect(res.accepted).toBe(true);
  });

  it('on success writes an audit log, repoints the server, clears variables and queues a reinstall', async () => {
    prisma.server.findFirst.mockResolvedValue(makeServer());
    prisma.gameTemplate.findUnique.mockResolvedValue(makeTarget());

    const res = await service.switchGame(SERVER_ID, ACTOR_ID, dto({ preserveData: true }));

    expect(res.accepted).toBe(true);
    expect(typeof res.gameSwitchLogId).toBe('string');
    expect(res.gameSwitchLogId.length).toBeGreaterThan(0);

    // The atomic batch contains exactly three operations.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const batch = prisma.$transaction.mock.calls[0][0];
    expect(Array.isArray(batch)).toBe(true);
    expect(batch).toHaveLength(3);

    // Audit log captures from/to slugs and the actor.
    const logArgs = prisma.gameSwitchLog.create.mock.calls[0][0];
    expect(logArgs.data).toMatchObject({
      serverId: SERVER_ID,
      fromTemplate: 'minecraft',
      toTemplate: 'rust',
      preservedData: true,
      performedById: ACTOR_ID,
      id: res.gameSwitchLogId,
    });

    // Stale per-game variable overrides are cleared.
    expect(prisma.serverVariable.deleteMany).toHaveBeenCalledWith({
      where: { serverId: SERVER_ID },
    });

    // Reinstall job carries the switch-log id and preserveData flag.
    expect(reinstallQueue.add).toHaveBeenCalledTimes(1);
    const [, jobPayload] = reinstallQueue.add.mock.calls[0];
    expect(jobPayload).toEqual({
      serverId: SERVER_ID,
      gameSwitchLogId: res.gameSwitchLogId,
      preserveData: true,
    });
  });

  it('defaults preserveData to false when omitted (clean install)', async () => {
    prisma.server.findFirst.mockResolvedValue(makeServer());
    prisma.gameTemplate.findUnique.mockResolvedValue(makeTarget());
    await service.switchGame(SERVER_ID, ACTOR_ID, dto());
    const logArgs = prisma.gameSwitchLog.create.mock.calls[0][0];
    expect(logArgs.data.preservedData).toBe(false);
    expect(reinstallQueue.add.mock.calls[0][1].preserveData).toBe(false);
  });

  it('preserves server identity: switch does not touch ownerId/shortId/subscriptionId', async () => {
    prisma.server.findFirst.mockResolvedValue(makeServer());
    prisma.gameTemplate.findUnique.mockResolvedValue(makeTarget());

    // Capture the server.update call placed into the transaction batch.
    const updateSpy = jest.fn((args: any) => args);
    prisma.server.update = updateSpy;

    await service.switchGame(SERVER_ID, ACTOR_ID, dto());

    const updateArgs = updateSpy.mock.calls[0][0];
    const updatedFields = Object.keys(updateArgs.data);
    expect(updatedFields).not.toContain('ownerId');
    expect(updatedFields).not.toContain('shortId');
    expect(updatedFields).not.toContain('subscriptionId');
    // It does repoint the template/version and move into SWITCHING_GAME.
    expect(updateArgs.data).toMatchObject({
      templateId: TARGET_TEMPLATE_ID,
      templateVersion: '2.0.0',
      state: 'SWITCHING_GAME',
    });
  });

  it('proceeds even when the target recommends more memory than the plan (logs a warning only)', async () => {
    prisma.server.findFirst.mockResolvedValue(makeServer({ memoryMb: 1024 }));
    prisma.gameTemplate.findUnique.mockResolvedValue(makeTarget({ recMemoryMb: 8192 }));
    const res = await service.switchGame(SERVER_ID, ACTOR_ID, dto());
    expect(res.accepted).toBe(true);
  });
});
