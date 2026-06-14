import request from 'supertest';

import { buildTestApp, PREFIX, type TestAppHandles } from './utils/test-app';
import { HealthController } from '../src/platform/health.controller';
import { MetricsController } from '../src/platform/metrics.controller';
import { MetricsService } from '../src/platform/metrics.service';

describe('Health & platform (e2e)', () => {
  let h: TestAppHandles;

  beforeAll(async () => {
    h = await buildTestApp({
      controllers: [HealthController, MetricsController],
      providers: [MetricsService],
    });
  });

  afterAll(async () => {
    await h.close();
  });

  // health/metrics are excluded from the `api/v1` global prefix in main.ts and
  // there is no URI versioning, so they are served at the root (`/health`,
  // `/metrics`) — outside the `/api/v1` REST surface.
  const HEALTH = '/health';
  const METRICS = '/metrics';

  describe('GET /health', () => {
    it('returns 200 with the health shape, outside the api prefix', async () => {
      h.prisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

      const res = await request(h.app.getHttpServer()).get(HEALTH);

      expect(res.status).toBe(200);
      // @RawResponse is NOT set on health, so it IS wrapped by the envelope.
      const payload = res.body.data ?? res.body;
      expect(payload.status).toBe('ok');
      expect(payload.checks).toEqual({ database: 'up' });
      expect(typeof payload.uptime).toBe('number');
      expect(typeof payload.timestamp).toBe('string');
    });

    it('reports database "down" when the probe query fails', async () => {
      h.prisma.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));

      const res = await request(h.app.getHttpServer()).get(HEALTH);

      expect(res.status).toBe(200);
      const payload = res.body.data ?? res.body;
      expect(payload.checks.database).toBe('down');
    });

    it('is NOT served under the /api/v1 prefix (404 there)', async () => {
      const res = await request(h.app.getHttpServer()).get(`${PREFIX}/health`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /metrics', () => {
    it('returns 200 Prometheus exposition text outside the api prefix', async () => {
      const res = await request(h.app.getHttpServer()).get(METRICS);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      // Default process metrics are always present in the exposition output.
      expect(res.text).toContain('# HELP');
      expect(res.text).toContain('process_cpu_user_seconds_total');
    });

    it('is NOT served under the /api/v1 prefix (404 there)', async () => {
      const res = await request(h.app.getHttpServer()).get(`${PREFIX}/metrics`);
      expect(res.status).toBe(404);
    });
  });
});
