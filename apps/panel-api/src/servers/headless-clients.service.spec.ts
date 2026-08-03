import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { HeadlessClientsService } from './headless-clients.service';

const ARMA = {
  id: 's1',
  ownerId: 'owner',
  subscriptionId: 'sub1',
  template: { slug: 'arma3', variables: [{ envName: 'HEADLESS_CLIENTS' }] },
  variables: [{ value: '0' }],
};

function make(
  server: any = ARMA,
  cfg = { enabled: true, monthlyMinor: 400 },
  sub: any = { headlessClients: 0, headlessClientsComp: 0, priceId: 'p1' },
) {
  const prisma: any = {
    server: { findFirst: jest.fn().mockResolvedValue(server) },
    subscription: {
      findUnique: jest.fn().mockResolvedValue(sub),
      update: jest.fn().mockResolvedValue({}),
    },
    price: { findUnique: jest.fn().mockResolvedValue({ currency: 'USD' }) },
    serverVariable: { upsert: jest.fn().mockResolvedValue({}) },
  };
  const settings = { headlessClientsConfig: jest.fn().mockResolvedValue(cfg) };
  const servers = { reloadSpec: jest.fn().mockResolvedValue(undefined) };
  const svc = new HeadlessClientsService(prisma, settings as any, servers as any);
  return { svc, prisma, settings, servers };
}

/** The HEADLESS_CLIENTS value the launcher would read after the call. */
function appliedValue(prisma: any): string {
  return prisma.serverVariable.upsert.mock.calls.at(-1)[0].update.value;
}

describe('HeadlessClientsService', () => {
  it('setCount is owner-only (billing decision)', async () => {
    const { svc } = make();
    await expect(svc.setCount('s1', 'not-owner', 2)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects games without the HEADLESS_CLIENTS variable', async () => {
    const { svc } = make({ ...ARMA, template: { slug: 'rust', variables: [] } });
    await expect(svc.setCount('s1', 'owner', 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('clamps the count to 0..3, updates the subscription + variable, reloads spec', async () => {
    const { svc, prisma, servers } = make();
    await svc.setCount('s1', 'owner', 99);
    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub1' },
      data: { headlessClients: 3 },
    });
    expect(prisma.serverVariable.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ envName: 'HEADLESS_CLIENTS', value: '3' }),
        update: { value: '3' },
      }),
    );
    expect(servers.reloadSpec).toHaveBeenCalledWith('s1');
  });

  it('applies unbilled on subscription-less (admin-made) servers', async () => {
    const { svc, prisma } = make({ ...ARMA, subscriptionId: null });
    await svc.setCount('s1', 'owner', 2);
    expect(prisma.subscription.update).not.toHaveBeenCalled();
    expect(prisma.serverVariable.upsert).toHaveBeenCalled();
  });

  it('refuses when the add-on is disabled', async () => {
    const { svc } = make(ARMA, { enabled: false, monthlyMinor: 400 });
    await expect(svc.setCount('s1', 'owner', 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // ---- admin comp ---------------------------------------------------------

  describe('setComp', () => {
    it('applies the comped count without touching the billed count', async () => {
      const { svc, prisma, servers } = make();
      await svc.setComp('s1', 2);
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub1' },
        data: { headlessClientsComp: 2 },
      });
      // The billed field is never written by a comp.
      expect(prisma.subscription.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ headlessClients: expect.anything() }),
        }),
      );
      expect(appliedValue(prisma)).toBe('2');
      expect(servers.reloadSpec).toHaveBeenCalledWith('s1');
    });

    it('applies max(paid, comped) — a smaller comp never takes clients away', async () => {
      const { svc, prisma } = make(ARMA, undefined, {
        headlessClients: 3,
        headlessClientsComp: 0,
        priceId: 'p1',
      });
      await svc.setComp('s1', 1);
      expect(appliedValue(prisma)).toBe('3');
    });

    it('clamps the comp to the maximum', async () => {
      const { svc, prisma } = make();
      await svc.setComp('s1', 99);
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub1' },
        data: { headlessClientsComp: 3 },
      });
      expect(appliedValue(prisma)).toBe('3');
    });

    it('clearing the comp drops back to the paid count', async () => {
      const { svc, prisma } = make(ARMA, undefined, {
        headlessClients: 1,
        headlessClientsComp: 3,
        priceId: 'p1',
      });
      await svc.setComp('s1', 0);
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub1' },
        data: { headlessClientsComp: 0 },
      });
      expect(appliedValue(prisma)).toBe('1');
    });

    it('works on a subscription-less server instead of erroring', async () => {
      const { svc, prisma, servers } = make({ ...ARMA, subscriptionId: null });
      await svc.setComp('s1', 2);
      expect(prisma.subscription.update).not.toHaveBeenCalled();
      expect(appliedValue(prisma)).toBe('2');
      expect(servers.reloadSpec).toHaveBeenCalledWith('s1');
    });

    it('is allowed even when the add-on is not being offered', async () => {
      const { svc, prisma } = make(ARMA, { enabled: false, monthlyMinor: 400 });
      await svc.setComp('s1', 1);
      expect(appliedValue(prisma)).toBe('1');
    });

    it('still refuses games without the HEADLESS_CLIENTS variable', async () => {
      const { svc } = make({ ...ARMA, template: { slug: 'rust', variables: [] } });
      await expect(svc.setComp('s1', 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('setCount with a comp in place', () => {
    it('keeps the comped clients when the customer buys fewer', async () => {
      const { svc, prisma } = make(ARMA, undefined, {
        headlessClients: 2,
        headlessClientsComp: 3,
        priceId: 'p1',
      });
      await svc.setCount('s1', 'owner', 1);
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub1' },
        data: { headlessClients: 1 },
      });
      expect(appliedValue(prisma)).toBe('3');
    });
  });

  describe('status', () => {
    it('separates the billed count from the comped and applied ones', async () => {
      const { svc } = make(ARMA, undefined, {
        headlessClients: 1,
        headlessClientsComp: 3,
        priceId: 'p1',
      });
      const status = await svc.status('s1');
      expect(status.count).toBe(1);
      expect(status.compedCount).toBe(3);
      expect(status.appliedCount).toBe(3);
      expect(status.unbilled).toBe(false);
    });

    it('reports the applied variable on a subscription-less server', async () => {
      const { svc } = make({
        ...ARMA,
        subscriptionId: null,
        variables: [{ value: '2' }],
      });
      const status = await svc.status('s1');
      expect(status).toEqual(
        expect.objectContaining({
          count: 2,
          compedCount: 0,
          appliedCount: 2,
          unbilled: true,
        }),
      );
    });
  });
});
