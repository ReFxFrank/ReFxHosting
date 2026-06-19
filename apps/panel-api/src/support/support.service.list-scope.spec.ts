import { SupportService } from './support.service';
import { AuthUser } from '../common/decorators/current-user.decorator';

/**
 * The client area must be self-scoped even for staff: a staff member who is also
 * a customer sees only their OWN tickets there (full queue is admin-only). The
 * shared GET /support/tickets honors `mine` to provide that view.
 */
describe('SupportService.listTickets scoping', () => {
  function svcWithCapture() {
    const prisma = {
      $transaction: jest.fn().mockResolvedValue([[], 0]),
      ticket: {
        findMany: jest.fn().mockReturnValue('findMany'),
        count: jest.fn().mockReturnValue('count'),
      },
    };
    return { prisma, svc: new SupportService(prisma as any, { emit: jest.fn() } as any) };
  }

  const staff = { id: 'staff-1', email: 's@x', globalRole: 'ADMIN', state: 'ACTIVE' } as AuthUser;
  const customer = { id: 'cust-1', email: 'c@x', globalRole: 'CUSTOMER', state: 'ACTIVE' } as AuthUser;
  const page = { skip: 0, take: 20 } as any;

  it('staff WITHOUT mine see the whole queue (no requester filter)', async () => {
    const { prisma, svc } = svcWithCapture();
    await svc.listTickets(staff, page, {});
    expect(prisma.ticket.findMany.mock.calls[0][0].where.requesterId).toBeUndefined();
  });

  it('staff WITH mine=true are self-scoped (client area view)', async () => {
    const { prisma, svc } = svcWithCapture();
    await svc.listTickets(staff, page, { mine: true });
    expect(prisma.ticket.findMany.mock.calls[0][0].where.requesterId).toBe('staff-1');
    // self-scoped view drops the staff queue `include`
    expect(prisma.ticket.findMany.mock.calls[0][0].include).toBeUndefined();
  });

  it('a customer is always self-scoped regardless of mine', async () => {
    const { prisma, svc } = svcWithCapture();
    await svc.listTickets(customer, page, {});
    expect(prisma.ticket.findMany.mock.calls[0][0].where.requesterId).toBe('cust-1');
  });
});
