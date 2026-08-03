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

function make(server: any = ARMA, cfg = { enabled: true, monthlyMinor: 400 }) {
  const prisma: any = {
    server: { findFirst: jest.fn().mockResolvedValue(server) },
    subscription: {
      findUnique: jest.fn().mockResolvedValue({ headlessClients: 0, priceId: 'p1' }),
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
});
