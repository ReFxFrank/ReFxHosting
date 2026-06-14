import request from 'supertest';

import { buildTestApp, PREFIX, type TestAppHandles } from './utils/test-app';
import { BillingController } from '../src/billing/billing.controller';
import { BillingService } from '../src/billing/billing.service';
import { StripeWebhookController } from '../src/billing/webhooks/stripe-webhook.controller';
import { StripeGateway } from '../src/billing/gateways/stripe.gateway';
import { QUEUE } from '../src/queues/queue.constants';
import { getQueueToken } from '@nestjs/bullmq';
import { createQueueMock } from './utils/prisma.mock';

describe('Billing (e2e)', () => {
  let h: TestAppHandles;
  let stripe: { verifyWebhook: jest.Mock; name: string };

  beforeAll(async () => {
    stripe = { name: 'stripe', verifyWebhook: jest.fn() };
    h = await buildTestApp({
      controllers: [BillingController, StripeWebhookController],
      providers: [BillingService],
      overrides: [
        { token: StripeGateway, useValue: stripe },
        { token: getQueueToken(QUEUE.BILLING_RENEWAL), useValue: createQueueMock() },
        { token: getQueueToken(QUEUE.SUSPENSION), useValue: createQueueMock() },
      ],
    });
  });

  afterAll(async () => {
    await h.close();
  });

  function asUser(id = 'u-1', role = 'CUSTOMER') {
    h.prisma.user.findFirst.mockResolvedValueOnce({
      id,
      email: `${id}@example.com`,
      globalRole: role,
      state: 'ACTIVE',
    });
    return h.signAccess({ sub: id, email: `${id}@example.com`, role });
  }

  describe('GET /billing/products', () => {
    it('requires authentication (401)', async () => {
      const res = await request(h.app.getHttpServer()).get(
        `${PREFIX}/billing/products`,
      );
      expect(res.status).toBe(401);
    });

    it('returns the active product catalog for an authed user (200)', async () => {
      const token = await asUser();
      h.prisma.product.findMany.mockResolvedValueOnce([
        { id: 'p-1', name: 'Starter', isActive: true, prices: [] },
      ]);

      const res = await request(h.app.getHttpServer())
        .get(`${PREFIX}/billing/products`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Starter');
    });
  });

  describe('POST /billing/webhooks/stripe', () => {
    const path = `${PREFIX}/billing/webhooks/stripe`;

    it('rejects a request with no stripe-signature header (400)', async () => {
      const res = await request(h.app.getHttpServer())
        .post(path)
        .set('Content-Type', 'application/json')
        .send({ id: 'evt_1', type: 'invoice.payment_succeeded' });

      expect(res.status).toBe(400);
      expect(stripe.verifyWebhook).not.toHaveBeenCalled();
    });

    it('rejects an invalid signature (400) when verification throws', async () => {
      stripe.verifyWebhook.mockImplementationOnce(() => {
        throw new Error('No signatures found matching the expected signature');
      });

      const res = await request(h.app.getHttpServer())
        .post(path)
        .set('stripe-signature', 't=1,v1=deadbeef')
        .set('Content-Type', 'application/json')
        .send({ id: 'evt_1', type: 'invoice.payment_succeeded' });

      expect(res.status).toBe(400);
      expect(stripe.verifyWebhook).toHaveBeenCalledTimes(1);
    });

    it('accepts a validly-signed event (200) and returns { received: true }', async () => {
      // Mock the gateway verify to return an event we do not specially handle,
      // so dispatch is a no-op and the endpoint simply acks.
      stripe.verifyWebhook.mockReturnValueOnce({
        id: 'evt_ok',
        type: 'customer.created',
        data: { object: {} },
      } as never);

      const res = await request(h.app.getHttpServer())
        .post(path)
        .set('stripe-signature', 't=1,v1=validsig')
        .set('Content-Type', 'application/json')
        .send({ id: 'evt_ok', type: 'customer.created' });

      expect(res.status).toBe(200);
      // @RawResponse(): no { success, data } envelope.
      expect(res.body).toEqual({ received: true });
    });
  });
});
