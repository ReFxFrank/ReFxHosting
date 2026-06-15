import request from 'supertest';
import * as argon2 from 'argon2';

import { buildTestApp, PREFIX, type TestAppHandles } from './utils/test-app';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { WebAuthnService } from '../src/auth/webauthn.service';
import { ServersController } from '../src/servers/servers.controller';
import { ServersService } from '../src/servers/servers.service';
import { ServerResourcesService } from '../src/servers/server-resources.service';
import { MinecraftResolverService } from '../src/servers/minecraft-resolver.service';
import { NodesService } from '../src/nodes/nodes.service';
import { NodeAgentClient } from '../src/agent/agent.client';
import { QUEUE } from '../src/queues/queue.constants';
import { getQueueToken } from '@nestjs/bullmq';
import { createQueueMock } from './utils/prisma.mock';

const ARGON_OPTS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

describe('Auth (e2e)', () => {
  let h: TestAppHandles;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await argon2.hash('correct-horse-battery', ARGON_OPTS);

    h = await buildTestApp({
      controllers: [AuthController, ServersController],
      providers: [
        AuthService,
        // WebAuthnService is needed only because AuthController injects it.
        { provide: WebAuthnService, useValue: {} },
        ServersService,
        { provide: ServerResourcesService, useValue: {} },
        {
          provide: MinecraftResolverService,
          useValue: { resolve: jest.fn(async (_s: unknown, v: string) => v ?? 'latest'), resolveByLoader: jest.fn(async (_l: unknown, v: string) => v ?? 'latest') },
        },
        { provide: NodesService, useValue: {} },
        { provide: NodeAgentClient, useValue: { power: jest.fn() } },
      ],
      overrides: [
        { token: getQueueToken(QUEUE.PROVISIONING), useValue: createQueueMock() },
        { token: getQueueToken(QUEUE.REINSTALL), useValue: createQueueMock() },
        { token: getQueueToken(QUEUE.SUSPENSION), useValue: createQueueMock() },
      ],
    });
  });

  afterAll(async () => {
    await h.close();
  });

  describe('POST /api/v1/auth/register', () => {
    it('rejects a missing email and short password with 400', async () => {
      const res = await request(h.app.getHttpServer())
        .post(`${PREFIX}/auth/register`)
        .send({ password: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.statusCode).toBe(400);
      expect(Array.isArray(res.body.message)).toBe(true);
    });

    it('rejects an invalid email with 400', async () => {
      const res = await request(h.app.getHttpServer())
        .post(`${PREFIX}/auth/register`)
        .send({ email: 'not-an-email', password: 'a-strong-password-123' });

      expect(res.status).toBe(400);
    });

    it('rejects unknown/non-whitelisted fields with 400', async () => {
      const res = await request(h.app.getHttpServer())
        .post(`${PREFIX}/auth/register`)
        .send({
          email: 'ok@example.com',
          password: 'a-strong-password-123',
          isAdmin: true,
        });

      expect(res.status).toBe(400);
    });

    it('creates a user on a valid payload (201)', async () => {
      h.prisma.user.findUnique.mockResolvedValueOnce(null);
      h.prisma.user.create.mockResolvedValueOnce({
        id: 'u-1',
        email: 'new@example.com',
      });

      const res = await request(h.app.getHttpServer())
        .post(`${PREFIX}/auth/register`)
        .send({ email: 'new@example.com', password: 'a-strong-password-123' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        success: true,
        data: { id: 'u-1', email: 'new@example.com' },
      });
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('returns tokens on correct credentials (200)', async () => {
      h.prisma.user.findFirst.mockResolvedValueOnce({
        id: 'u-1',
        email: 'user@example.com',
        passwordHash,
        globalRole: 'CUSTOMER',
        state: 'ACTIVE',
        totpEnabledAt: null,
        totpSecretEnc: null,
        deletedAt: null,
      });
      h.prisma.session.create.mockResolvedValueOnce({ id: 's-1' });

      const res = await request(h.app.getHttpServer())
        .post(`${PREFIX}/auth/login`)
        .send({ email: 'user@example.com', password: 'correct-horse-battery' });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(res.body.data.refreshToken).toEqual(expect.any(String));
      expect(res.body.data.expiresIn).toBe(900);
    });

    it('returns 401 on a wrong password', async () => {
      h.prisma.user.findFirst.mockResolvedValueOnce({
        id: 'u-1',
        email: 'user@example.com',
        passwordHash,
        globalRole: 'CUSTOMER',
        state: 'ACTIVE',
        totpEnabledAt: null,
        totpSecretEnc: null,
        deletedAt: null,
      });

      const res = await request(h.app.getHttpServer())
        .post(`${PREFIX}/auth/login`)
        .send({ email: 'user@example.com', password: 'wrong-password' });

      expect(res.status).toBe(401);
    });

    it('returns 401 for an unknown user', async () => {
      h.prisma.user.findFirst.mockResolvedValueOnce(null);

      const res = await request(h.app.getHttpServer())
        .post(`${PREFIX}/auth/login`)
        .send({ email: 'ghost@example.com', password: 'whatever-strong' });

      expect(res.status).toBe(401);
    });
  });

  describe('protected route (JWT)', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(h.app.getHttpServer()).get(`${PREFIX}/servers`);
      expect(res.status).toBe(401);
    });

    it('rejects a malformed/invalid bearer token with 401', async () => {
      const res = await request(h.app.getHttpServer())
        .get(`${PREFIX}/servers`)
        .set('Authorization', 'Bearer not-a-real-jwt');
      expect(res.status).toBe(401);
    });

    it('allows access with a valid token (200)', async () => {
      // JwtStrategy.validate re-loads the user from the DB.
      h.prisma.user.findFirst.mockResolvedValueOnce({
        id: 'u-1',
        email: 'user@example.com',
        globalRole: 'CUSTOMER',
        state: 'ACTIVE',
      });
      // ServersService.list runs a $transaction([findMany, count]).
      h.prisma.server.findMany.mockResolvedValueOnce([]);
      h.prisma.server.count.mockResolvedValueOnce(0);

      const token = await h.signAccess({ sub: 'u-1', email: 'user@example.com' });
      const res = await request(h.app.getHttpServer())
        .get(`${PREFIX}/servers`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
