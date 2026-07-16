import { BadRequestException, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { BugsService } from './bugs.service';

const customer = { id: 'u-cust', email: 'c@e.com', globalRole: 'CUSTOMER', state: 'ACTIVE' } as any;
const staff = { id: 'u-staff', email: 's@e.com', globalRole: 'ADMIN', state: 'ACTIVE' } as any;

function make() {
  const prisma: any = {
    server: { findFirst: jest.fn().mockResolvedValue(null) },
    bugReport: {
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ number: 7, ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    bugComment: { create: jest.fn().mockResolvedValue({}) },
    bugAttachment: { create: jest.fn().mockResolvedValue({ id: 'a1' }), findFirst: jest.fn() },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'u-staff' }]), findFirst: jest.fn() },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const notifications = { notifyMany: jest.fn().mockResolvedValue(undefined) };
  const svc = new BugsService(prisma as any, notifications as any);
  return { svc, prisma, notifications };
}

describe('BugsService', () => {
  it('create: stamps reporter, notifies all staff', async () => {
    const { svc, prisma, notifications } = make();
    const r = await svc.create(customer, {
      title: 'Console blank',
      description: 'The console shows nothing after refresh',
    } as any);
    expect(r.reporterId).toBe('u-cust');
    expect(prisma.bugReport.create).toHaveBeenCalled();
    expect(notifications.notifyMany).toHaveBeenCalledWith(['u-staff'], expect.objectContaining({ title: expect.stringContaining('BUG-') }));
  });

  it('create: ignores a serverId the reporter cannot see', async () => {
    const { svc, prisma } = make();
    prisma.server.findFirst.mockResolvedValue(null); // not owner/sub-user
    const r = await svc.create(customer, { title: 'x'.repeat(4), description: 'y'.repeat(12), serverId: 'srv-x' } as any);
    expect(r.serverId).toBeNull();
  });

  it('list: a customer is force-scoped to their own reports', async () => {
    const { svc, prisma } = make();
    await svc.list(customer, { skip: 0, take: 25, page: 1, pageSize: 25 } as any);
    const where = prisma.bugReport.findMany.mock.calls[0][0].where;
    expect(where.reporterId).toBe('u-cust');
  });

  it('list: staff see everything (no reporter scope) but can self-scope with mine', async () => {
    const { svc, prisma } = make();
    await svc.list(staff, { skip: 0, take: 25, page: 1, pageSize: 25 } as any);
    expect(prisma.bugReport.findMany.mock.calls[0][0].where.reporterId).toBeUndefined();
    await svc.list(staff, { mine: 'true', skip: 0, take: 25, page: 1, pageSize: 25 } as any);
    expect(prisma.bugReport.findMany.mock.calls[1][0].where.reporterId).toBe('u-staff');
  });

  it('get: 404 for a non-owner customer; internal comments hidden from the reporter', async () => {
    const { svc, prisma } = make();
    prisma.bugReport.findUnique.mockResolvedValue({
      id: 'b1', reporterId: 'someone-else', comments: [], attachments: [],
    });
    await expect(svc.get(customer, 'b1')).rejects.toBeInstanceOf(NotFoundException);

    prisma.bugReport.findUnique.mockResolvedValue({
      id: 'b1', reporterId: 'u-cust',
      comments: [{ isInternal: false, body: 'hi' }, { isInternal: true, body: 'staff note' }],
      attachments: [],
    });
    const got = await svc.get(customer, 'b1');
    expect(got.comments).toHaveLength(1);
    expect(got.comments[0].body).toBe('hi');
  });

  it('update: rejects an assignee who is not staff', async () => {
    const { svc, prisma } = make();
    prisma.bugReport.findUnique.mockResolvedValue({ id: 'b1' });
    prisma.user.findFirst.mockResolvedValue({ globalRole: 'CUSTOMER' });
    await expect(svc.update('b1', { assigneeId: 'u-cust' } as any)).rejects.toThrow();
  });

  it('addComment: isInternal is ignored for a customer', async () => {
    const { svc, prisma } = make();
    prisma.bugReport.findUnique.mockResolvedValue({ id: 'b1', reporterId: 'u-cust' });
    await svc.addComment(customer, 'b1', { body: 'note', isInternal: true } as any);
    expect(prisma.bugComment.create.mock.calls[0][0].data.isInternal).toBe(false);
  });

  describe('addAttachment', () => {
    const report = { id: 'b1', reporterId: 'u-cust', _count: { attachments: 0 } };
    it('rejects a non-image type', async () => {
      const { svc, prisma } = make();
      prisma.bugReport.findUnique.mockResolvedValue(report);
      await expect(
        svc.addAttachment(customer, 'b1', 'x.pdf', 'application/pdf', Buffer.from('hi')),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
    it('rejects an oversized image', async () => {
      const { svc, prisma } = make();
      prisma.bugReport.findUnique.mockResolvedValue(report);
      const big = Buffer.alloc(6 * 1024 * 1024);
      await expect(
        svc.addAttachment(customer, 'b1', 'x.png', 'image/png', big),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
    });
    it('rejects when the per-report cap is reached', async () => {
      const { svc, prisma } = make();
      prisma.bugReport.findUnique.mockResolvedValue({ ...report, _count: { attachments: 4 } });
      await expect(
        svc.addAttachment(customer, 'b1', 'x.png', 'image/png', Buffer.from([1, 2, 3])),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
    it('accepts a valid small PNG', async () => {
      const { svc, prisma } = make();
      prisma.bugReport.findUnique.mockResolvedValue(report);
      const att = await svc.addAttachment(customer, 'b1', 'shot.png', 'image/png;charset=x', Buffer.from([1, 2, 3]));
      expect(att.id).toBe('a1');
      expect(prisma.bugAttachment.create.mock.calls[0][0].data.contentType).toBe('image/png');
    });
  });
});
