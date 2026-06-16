import request from 'supertest';

import { buildTestApp, PREFIX, type TestAppHandles } from './utils/test-app';
import { BillingController } from '../src/billing/billing.controller';
import { BillingService } from '../src/billing/billing.service';
import { CouponsService } from '../src/billing/coupons.service';
import { GiftCardsService } from '../src/billing/gift-cards.service';
import { CreditService } from '../src/billing/credit.service';
import { AuditController } from '../src/platform/audit.controller';
import { AuditService } from '../src/platform/audit.service';
import { StripeGateway } from '../src/billing/gateways/stripe.gateway';
import { PayPalGateway } from '../src/billing/gateways/paypal.gateway';
import { QUEUE } from '../src/queues/queue.constants';
import { getQueueToken } from '@nestjs/bullmq';
import { createQueueMock } from './utils/prisma.mock';

/**
 * Focused coverage of the global ValidationPipe + class-validator DTOs:
 * bad enum, out-of-range number, malformed UUID and the standard NestJS error
 * envelope ({ statusCode, message, error, path, timestamp }).
 */
describe('Validation (e2e)', () => {
  let h: TestAppHandles;

  beforeAll(async () => {
    h = await buildTestApp({
      controllers: [BillingController, AuditController],
      providers: [BillingService, AuditService, CouponsService, GiftCardsService, CreditService],
      overrides: [
        { token: StripeGateway, useValue: { name: 'stripe', verifyWebhook: jest.fn() } },
        { token: PayPalGateway, useValue: { name: 'paypal', createCheckoutSession: jest.fn() } },
        { token: getQueueToken(QUEUE.BILLING_RENEWAL), useValue: createQueueMock() },
        { token: getQueueToken(QUEUE.SUSPENSION), useValue: createQueueMock() },
        { token: getQueueToken(QUEUE.PROVISIONING), useValue: createQueueMock() },
      ],
    });
  });

  afterAll(async () => {
    await h.close();
  });

  /** Authenticate as ADMIN so validation runs (guards pass first). */
  function asAdmin() {
    h.prisma.user.findFirst.mockResolvedValueOnce({
      id: 'adm-1',
      email: 'adm@example.com',
      globalRole: 'ADMIN',
      state: 'ACTIVE',
    });
    return h.signAccess({ sub: 'adm-1', email: 'adm@example.com', role: 'ADMIN' });
  }

  it('rejects a bad enum value with 400 and the standard error body', async () => {
    const token = await asAdmin();
    const res = await request(h.app.getHttpServer())
      .post(`${PREFIX}/billing/products`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'NOT_A_REAL_TYPE', name: 'X', slug: 'x' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      path: `${PREFIX}/billing/products`,
    });
    expect(typeof res.body.timestamp).toBe('string');
    expect(res.body.error).toBeDefined();
    expect(Array.isArray(res.body.message)).toBe(true);
    expect(res.body.message.join(' ')).toMatch(/type/i);
  });

  it('rejects a malformed slug (regex constraint) with 400', async () => {
    const token = await asAdmin();
    const res = await request(h.app.getHttpServer())
      .post(`${PREFIX}/billing/products`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'GAME_SERVER', name: 'X', slug: 'Not Kebab Case!' });

    expect(res.status).toBe(400);
    expect(res.body.message.join(' ')).toMatch(/kebab-case/i);
  });

  it('rejects an out-of-range pagination number (pageSize > 100) with 400', async () => {
    const token = await asAdmin();
    const res = await request(h.app.getHttpServer())
      .get(`${PREFIX}/platform/audit-logs`)
      .query({ pageSize: 9999 })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.statusCode).toBe(400);
    expect(res.body.message.join(' ')).toMatch(/pageSize/);
  });

  it('rejects a malformed UUID filter with 400', async () => {
    const token = await asAdmin();
    const res = await request(h.app.getHttpServer())
      .get(`${PREFIX}/platform/audit-logs`)
      .query({ actorId: 'not-a-uuid' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.message.join(' ')).toMatch(/actorId/);
  });

  it('accepts valid pagination query and coerces types (200)', async () => {
    const token = await asAdmin();
    h.prisma.auditLog.findMany.mockResolvedValueOnce([]);
    h.prisma.auditLog.count.mockResolvedValueOnce(0);

    const res = await request(h.app.getHttpServer())
      .get(`${PREFIX}/platform/audit-logs`)
      .query({ page: 2, pageSize: 10 })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});
