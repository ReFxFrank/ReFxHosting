import request from 'supertest';

import { buildTestApp, PREFIX, type TestAppHandles } from './utils/test-app';
import { ServersController } from '../src/servers/servers.controller';
import { ServersService } from '../src/servers/servers.service';
import { ServerResourcesService } from '../src/servers/server-resources.service';
import { BillingService } from '../src/billing/billing.service';
import { ScheduleRunner } from '../src/servers/schedule.runner';
import { ModsService } from '../src/servers/mods.service';
import { ModpackService } from '../src/servers/modpack.service';
import { WorkshopService } from '../src/servers/workshop.service';
import { VoiceService } from '../src/servers/voice.service';
import { MinecraftResolverService } from '../src/servers/minecraft-resolver.service';
import { NodesService } from '../src/nodes/nodes.service';
import { NodeAgentClient } from '../src/agent/agent.client';
import { QUEUE } from '../src/queues/queue.constants';
import { getQueueToken } from '@nestjs/bullmq';
import { createQueueMock } from './utils/prisma.mock';

const OWNER_ID = 'owner-1';
const STRANGER_ID = 'stranger-1';
const SERVER_ID = 'srv-1';

describe('Servers (e2e)', () => {
  let h: TestAppHandles;
  let reinstallQueue: { add: jest.Mock };

  beforeAll(async () => {
    reinstallQueue = createQueueMock();
    h = await buildTestApp({
      controllers: [ServersController],
      providers: [
        ServersService,
        // Injected by ServersService; billing logic isn't under test here.
        { provide: BillingService, useValue: {} },
        { provide: ServerResourcesService, useValue: {} },
        { provide: ScheduleRunner, useValue: { runNow: jest.fn() } },
        { provide: ModsService, useValue: {} },
        { provide: ModpackService, useValue: {} },
        { provide: WorkshopService, useValue: {} },
        { provide: VoiceService, useValue: {} },
        {
          provide: MinecraftResolverService,
          useValue: { resolve: jest.fn(async (_s: unknown, v: string) => v ?? 'latest'), resolveByLoader: jest.fn(async (_l: unknown, v: string) => v ?? 'latest') },
        },
        { provide: NodesService, useValue: {} },
        { provide: NodeAgentClient, useValue: { power: jest.fn() } },
      ],
      overrides: [
        { token: getQueueToken(QUEUE.PROVISIONING), useValue: createQueueMock() },
        { token: getQueueToken(QUEUE.REINSTALL), useValue: reinstallQueue },
        { token: getQueueToken(QUEUE.SUSPENSION), useValue: createQueueMock() },
      ],
    });
  });

  afterAll(async () => {
    await h.close();
  });

  /** Make JwtStrategy.validate resolve to the given principal. */
  function asUser(id: string, role = 'CUSTOMER') {
    h.prisma.user.findFirst.mockResolvedValueOnce({
      id,
      email: `${id}@example.com`,
      globalRole: role,
      state: 'ACTIVE',
    });
    return h.signAccess({ sub: id, email: `${id}@example.com`, role });
  }

  describe('GET /servers (list)', () => {
    it('requires authentication (401)', async () => {
      const res = await request(h.app.getHttpServer()).get(`${PREFIX}/servers`);
      expect(res.status).toBe(401);
    });

    it('lists for an authenticated user (200)', async () => {
      const token = await asUser(OWNER_ID);
      h.prisma.server.findMany.mockResolvedValueOnce([{ id: SERVER_ID }]);
      h.prisma.server.count.mockResolvedValueOnce(1);

      const res = await request(h.app.getHttpServer())
        .get(`${PREFIX}/servers`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.meta.total).toBe(1);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /servers/:serverId (ownership)', () => {
    it('lets the owner read their server (200)', async () => {
      const token = await asUser(OWNER_ID);
      // PermissionGuard resolves ownership.
      h.prisma.server.findFirst.mockResolvedValueOnce({
        id: SERVER_ID,
        ownerId: OWNER_ID,
      });
      // ServersService.get then loads the full record.
      h.prisma.server.findFirst.mockResolvedValueOnce({
        id: SERVER_ID,
        ownerId: OWNER_ID,
        name: 'mc',
      });

      const res = await request(h.app.getHttpServer())
        .get(`${PREFIX}/servers/${SERVER_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(SERVER_ID);
    });

    it('forbids a stranger who is not a sub-user (403)', async () => {
      const token = await asUser(STRANGER_ID);
      // Server exists but is owned by someone else.
      h.prisma.server.findFirst.mockResolvedValueOnce({
        id: SERVER_ID,
        ownerId: OWNER_ID,
      });
      // No sub-user membership.
      h.prisma.subUser.findFirst.mockResolvedValueOnce(null);

      const res = await request(h.app.getHttpServer())
        .get(`${PREFIX}/servers/${SERVER_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 when the server does not exist', async () => {
      const token = await asUser(STRANGER_ID);
      h.prisma.server.findFirst.mockResolvedValueOnce(null);

      const res = await request(h.app.getHttpServer())
        .get(`${PREFIX}/servers/does-not-exist`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /servers/:serverId/switch-game', () => {
    /** Mock the PermissionGuard's ownership lookup (resolves the server owner). */
    function guardOwns() {
      h.prisma.server.findFirst.mockResolvedValueOnce({
        id: SERVER_ID,
        ownerId: OWNER_ID,
      });
    }

    it('rejects when the server is not stopped (409)', async () => {
      const token = await asUser(OWNER_ID);
      guardOwns();
      // ServersService.switchGame loads the server (RUNNING => not stopped).
      h.prisma.server.findFirst.mockResolvedValueOnce({
        id: SERVER_ID,
        ownerId: OWNER_ID,
        deletedAt: null,
        state: 'RUNNING',
        templateId: 'tpl-old',
        memoryMb: 2048,
        template: { slug: 'minecraft' },
        subscription: { product: { allowedTemplateIds: [] } },
      });

      const res = await request(h.app.getHttpServer())
        .post(`${PREFIX}/servers/${SERVER_ID}/switch-game`)
        .set('Authorization', `Bearer ${token}`)
        .send({ templateId: 'tpl-new' });

      expect(res.status).toBe(409);
      expect(reinstallQueue.add).not.toHaveBeenCalled();
    });

    it('rejects when target template is not whitelisted (403)', async () => {
      const token = await asUser(OWNER_ID);
      guardOwns();
      h.prisma.server.findFirst.mockResolvedValueOnce({
        id: SERVER_ID,
        ownerId: OWNER_ID,
        deletedAt: null,
        state: 'OFFLINE',
        templateId: 'tpl-old',
        memoryMb: 2048,
        template: { slug: 'minecraft' },
        subscription: { product: { allowedTemplateIds: ['tpl-allowed'] } },
      });
      h.prisma.gameTemplate.findUnique.mockResolvedValueOnce({
        id: 'tpl-new',
        slug: 'rust',
        version: '1',
        recMemoryMb: 1024,
        dockerImages: {},
        startupCommand: 'run',
        deployMethods: ['DOCKER'],
      });

      const res = await request(h.app.getHttpServer())
        .post(`${PREFIX}/servers/${SERVER_ID}/switch-game`)
        .set('Authorization', `Bearer ${token}`)
        .send({ templateId: 'tpl-new' });

      expect(res.status).toBe(403);
    });

    it('rejects switching to the same game (400)', async () => {
      const token = await asUser(OWNER_ID);
      guardOwns();
      h.prisma.server.findFirst.mockResolvedValueOnce({
        id: SERVER_ID,
        ownerId: OWNER_ID,
        deletedAt: null,
        state: 'OFFLINE',
        templateId: 'tpl-same',
        memoryMb: 2048,
        template: { slug: 'minecraft' },
        subscription: { product: { allowedTemplateIds: [] } },
      });

      const res = await request(h.app.getHttpServer())
        .post(`${PREFIX}/servers/${SERVER_ID}/switch-game`)
        .set('Authorization', `Bearer ${token}`)
        .send({ templateId: 'tpl-same' });

      expect(res.status).toBe(400);
    });

    it('accepts a valid switch and enqueues a reinstall (201)', async () => {
      reinstallQueue.add.mockClear();
      const token = await asUser(OWNER_ID);
      guardOwns();
      h.prisma.server.findFirst.mockResolvedValueOnce({
        id: SERVER_ID,
        ownerId: OWNER_ID,
        deletedAt: null,
        state: 'OFFLINE',
        templateId: 'tpl-old',
        memoryMb: 4096,
        deployMethod: 'DOCKER',
        template: { slug: 'minecraft' },
        subscription: { product: { allowedTemplateIds: [] } }, // empty = all allowed
      });
      h.prisma.gameTemplate.findUnique.mockResolvedValueOnce({
        id: 'tpl-new',
        slug: 'rust',
        version: '3',
        recMemoryMb: 2048,
        dockerImages: { default: 'img:rust' },
        startupCommand: 'rust-run',
        deployMethods: ['DOCKER'],
      });
      // $transaction([...]) is handled by the mock; switchGame ignores results.

      const res = await request(h.app.getHttpServer())
        .post(`${PREFIX}/servers/${SERVER_ID}/switch-game`)
        .set('Authorization', `Bearer ${token}`)
        .send({ templateId: 'tpl-new', preserveData: true });

      expect(res.status).toBe(201);
      expect(res.body.data.accepted).toBe(true);
      expect(res.body.data.gameSwitchLogId).toEqual(expect.any(String));
      expect(reinstallQueue.add).toHaveBeenCalledTimes(1);
      expect(reinstallQueue.add).toHaveBeenCalledWith(
        'reinstall',
        expect.objectContaining({ serverId: SERVER_ID, preserveData: true }),
      );
    });
  });
});
