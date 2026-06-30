import request from 'supertest';

import { buildTestApp, PREFIX, type TestAppHandles } from './utils/test-app';
import { CatalogController } from '../src/catalog/catalog.controller';
import { StorefrontService } from '../src/catalog/storefront.service';
import { MinecraftVersionsService } from '../src/catalog/minecraft-versions.service';
import { TemplatesService } from '../src/templates/templates.service';
import { HomepageAlertsService } from '../src/platform/homepage-alerts.service';
import { StaffService } from '../src/platform/staff.service';
import { BillingService } from '../src/billing/billing.service';
import { NodesService } from '../src/nodes/nodes.service';

/**
 * E2E for the PUBLIC storefront surface (no auth): published games, a single
 * game's order metadata, and homepage alerts. BillingService is stubbed (its
 * routes aren't exercised here); everything else is real over a mocked Prisma.
 */
describe('Catalog storefront (e2e)', () => {
  let h: TestAppHandles;

  beforeAll(async () => {
    h = await buildTestApp({
      controllers: [CatalogController],
      providers: [
        StorefrontService,
        MinecraftVersionsService,
        TemplatesService,
        HomepageAlertsService,
        { provide: StaffService, useValue: { listActive: jest.fn().mockResolvedValue([]) } },
      ],
      overrides: [
        { token: BillingService, useValue: {} },
        { token: NodesService, useValue: { regionsWithCapacity: jest.fn().mockResolvedValue([]) } },
      ],
    });
  });

  afterAll(async () => {
    await h.close();
  });

  // Reset call history between tests so `mock.calls[0]` is unambiguous (keeps
  // queued mockResolvedValueOnce values, which are set inside each test).
  beforeEach(() => jest.clearAllMocks());

  // ---- GET /catalog/games -------------------------------------------------

  describe('GET /catalog/games', () => {
    it('is public (no auth) and returns published games with a starting price', async () => {
      h.prisma.gameTemplate.findMany.mockResolvedValueOnce([
        {
          id: 't1',
          name: 'Minecraft: Paper',
          slug: 'minecraft-paper',
          description: 'Survival',
          featured: true,
          category: { id: 'c1', name: 'Survival', slug: 'survival', iconUrl: null },
        },
      ]);
      h.prisma.product.findMany.mockResolvedValueOnce([
        {
          id: 'p1',
          allowedTemplateIds: [],
          prices: [
            { id: 'pr2', amountMinor: 1500, currency: 'USD' },
            { id: 'pr1', amountMinor: 500, currency: 'USD' },
          ],
        },
      ]);

      const res = await request(h.app.getHttpServer()).get(`${PREFIX}/catalog/games`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].slug).toBe('minecraft-paper');
      // cheapest of 500/1500
      expect(res.body.data[0].startingPrice).toEqual({ amountMinor: 500, currency: 'USD' });

      // Only published GAME-kind templates are queried, excluding the voice
      // category (voice is its own catalog line).
      const where = h.prisma.gameTemplate.findMany.mock.calls[0][0].where;
      expect(where).toEqual({
        isPublished: true,
        kind: 'GAME',
        NOT: { category: { slug: 'voice' } },
      });
    });
  });

  // ---- GET /catalog/games/:slug ------------------------------------------

  describe('GET /catalog/games/:slug', () => {
    it('returns 404 for an unpublished / unknown game', async () => {
      h.prisma.gameTemplate.findFirst.mockResolvedValueOnce(null);
      const res = await request(h.app.getHttpServer()).get(
        `${PREFIX}/catalog/games/ghost`,
      );
      expect(res.status).toBe(404);
    });

    it('returns the game with only allowed plans + regions, querying published + safe fields', async () => {
      h.prisma.gameTemplate.findFirst.mockResolvedValueOnce({
        id: 't1',
        name: 'Minecraft: Paper',
        slug: 'minecraft-paper',
        author: 'ReFx',
        deployMethods: ['DOCKER'],
        variables: [],
        category: null,
      });
      h.prisma.product.findMany.mockResolvedValueOnce([
        {
          id: 'p1',
          name: 'Starter',
          slug: 'starter',
          description: null,
          cpuCores: 2,
          memoryMb: 4096,
          diskMb: 10240,
          slots: null,
          allowedTemplateIds: [], // allows all
          prices: [{ id: 'pr1', interval: 'MONTHLY', amountMinor: 500, currency: 'USD' }],
        },
        {
          id: 'p2',
          name: 'Other-only',
          slug: 'other',
          allowedTemplateIds: ['some-other-template'], // excludes t1
          prices: [{ id: 'pr2', interval: 'MONTHLY', amountMinor: 300, currency: 'USD' }],
        },
      ]);
      h.prisma.region.findMany.mockResolvedValueOnce([
        { id: 'r1', code: 'eu-central', name: 'EU Central', country: 'DE' },
      ]);

      const res = await request(h.app.getHttpServer()).get(
        `${PREFIX}/catalog/games/minecraft-paper`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.game.slug).toBe('minecraft-paper');
      expect(res.body.data.plans).toHaveLength(1); // p2 filtered out
      expect(res.body.data.plans[0].id).toBe('p1');
      expect(res.body.data.regions).toHaveLength(1);

      // Queried published-only, with a SAFE field whitelist (no install internals).
      const args = h.prisma.gameTemplate.findFirst.mock.calls[0][0];
      expect(args.where).toEqual({
        slug: 'minecraft-paper',
        isPublished: true,
        kind: 'GAME',
      });
      expect(args.select).toBeDefined();
      expect(args.select.installScript).toBeUndefined();
      expect(args.select.startupCommand).toBeUndefined();
      // Variables are restricted to viewable, non-secret.
      expect(args.select.variables.where).toEqual({
        userViewable: true,
        type: { not: 'SECRET' },
      });
    });
  });

  // ---- GET /catalog/homepage-alerts --------------------------------------

  describe('GET /catalog/homepage-alerts', () => {
    it('is public and returns only active, in-window alerts', async () => {
      h.prisma.homepageAlert.findMany.mockResolvedValueOnce([
        { id: 'a1', type: 'PROMO', title: 'Sale', body: '25% off', isActive: true },
      ]);

      const res = await request(h.app.getHttpServer()).get(
        `${PREFIX}/catalog/homepage-alerts`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      const where = h.prisma.homepageAlert.findMany.mock.calls[0][0].where;
      expect(where.isActive).toBe(true);
      expect(where.AND).toBeDefined(); // schedule-window guard
    });
  });
});
