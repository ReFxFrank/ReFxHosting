import request from 'supertest';

import { buildTestApp, PREFIX, type TestAppHandles } from './utils/test-app';
import { AuditController } from '../src/platform/audit.controller';
import { AuditService } from '../src/platform/audit.service';
import { BillingController } from '../src/billing/billing.controller';
import { BillingService } from '../src/billing/billing.service';
import { CouponsService } from '../src/billing/coupons.service';
import { GiftCardsService } from '../src/billing/gift-cards.service';
import { StripeGateway } from '../src/billing/gateways/stripe.gateway';
import { PayPalGateway } from '../src/billing/gateways/paypal.gateway';
import { QUEUE } from '../src/queues/queue.constants';
import { getQueueToken } from '@nestjs/bullmq';
import { createQueueMock } from './utils/prisma.mock';

describe('RBAC (e2e)', () => {
  let h: TestAppHandles;

  beforeAll(async () => {
    h = await buildTestApp({
      controllers: [AuditController, BillingController],
      providers: [
        AuditService,
        BillingService,
        CouponsService,
        GiftCardsService,
      ],
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

  function asUser(id: string, role: string) {
    h.prisma.user.findFirst.mockResolvedValueOnce({
      id,
      email: `${id}@example.com`,
      globalRole: role,
      state: 'ACTIVE',
    });
    return h.signAccess({ sub: id, email: `${id}@example.com`, role });
  }

  describe('admin-only audit-log browser', () => {
    const path = `${PREFIX}/platform/audit-logs`;

    it('still rejects an unauthenticated caller (401)', async () => {
      const res = await request(h.app.getHttpServer()).get(path);
      expect(res.status).toBe(401);
    });

    it('forbids a CUSTOMER (403)', async () => {
      const token = await asUser('cust-1', 'CUSTOMER');
      const res = await request(h.app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it('forbids a SUPPORT agent — below ADMIN (403)', async () => {
      const token = await asUser('sup-1', 'SUPPORT');
      const res = await request(h.app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it('allows an ADMIN (200)', async () => {
      const token = await asUser('adm-1', 'ADMIN');
      h.prisma.auditLog.findMany.mockResolvedValueOnce([]);
      h.prisma.auditLog.count.mockResolvedValueOnce(0);

      const res = await request(h.app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('allows an OWNER (role hierarchy) (200)', async () => {
      const token = await asUser('own-1', 'OWNER');
      h.prisma.auditLog.findMany.mockResolvedValueOnce([]);
      h.prisma.auditLog.count.mockResolvedValueOnce(0);

      const res = await request(h.app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });
  });

  describe('admin-only product creation', () => {
    const path = `${PREFIX}/billing/products`;

    it('forbids a CUSTOMER from creating a product (403)', async () => {
      const token = await asUser('cust-2', 'CUSTOMER');
      const res = await request(h.app.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'GAME_SERVER', name: 'Pro', slug: 'pro' });
      expect(res.status).toBe(403);
    });

    it('allows an ADMIN to create a product (201)', async () => {
      const token = await asUser('adm-2', 'ADMIN');
      h.prisma.product.create.mockResolvedValueOnce({ id: 'p-9', name: 'Pro' });

      const res = await request(h.app.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'GAME_SERVER', name: 'Pro', slug: 'pro' });
      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe('p-9');
    });
  });
});
