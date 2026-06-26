import { ForbiddenException } from '@nestjs/common';
import { SupportService } from './support.service';
import { AuthUser } from '../common/decorators/current-user.decorator';

/**
 * Ticket lifecycle rules:
 *  - replies auto-advance the status (customer -> awaiting reply / PENDING_AGENT,
 *    staff -> awaiting customer / PENDING_CUSTOMER);
 *  - a CLOSED/ARCHIVED ticket is locked for the customer (no more replies);
 *  - staff can still post (which reopens it);
 *  - deleting works from any state by closing first, then removing the ticket.
 */
describe('SupportService ticket lifecycle', () => {
  const staff = {
    id: 's1',
    email: 's@x',
    globalRole: 'ADMIN',
    state: 'ACTIVE',
  } as AuthUser;
  const customer = {
    id: 'c1',
    email: 'c@x',
    globalRole: 'CUSTOMER',
    state: 'ACTIVE',
  } as AuthUser;

  function make(ticketOverrides: Record<string, unknown> = {}) {
    const ticket = {
      id: 't1',
      requesterId: 'c1',
      state: 'OPEN',
      firstResponseAt: null,
      resolvedAt: null,
      categoryId: null,
      createdAt: new Date(),
      slaBreached: false,
      ...ticketOverrides,
    };
    const tx = {
      ticketMessage: {
        create: jest.fn(async ({ data }: any) => ({ id: 'm1', ...data })),
      },
      ticketCategory: { findUnique: jest.fn().mockResolvedValue(null) },
      ticket: {
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      ticket: { findUnique: jest.fn().mockResolvedValue(ticket) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const notifications = { createNotification: jest.fn(), notifyMany: jest.fn() };
    const push = { sendToUser: jest.fn() };
    const svc = new SupportService(
      prisma as any,
      notifications as any,
      push as any,
    );
    return { svc, prisma, tx, ticket };
  }

  it('blocks a customer reply on a CLOSED ticket', async () => {
    const { svc } = make({ state: 'CLOSED' });
    await expect(
      svc.addMessage(customer, 't1', { body: 'hi' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks a customer reply on an ARCHIVED ticket', async () => {
    const { svc } = make({ state: 'ARCHIVED' });
    await expect(
      svc.addMessage(customer, 't1', { body: 'hi' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets staff reply on a CLOSED ticket (reopens to PENDING_CUSTOMER)', async () => {
    const { svc, tx } = make({ state: 'CLOSED' });
    await svc.addMessage(staff, 't1', { body: 'following up' } as any);
    expect(tx.ticket.update.mock.calls[0][0].data.state).toBe(
      'PENDING_CUSTOMER',
    );
  });

  it('a customer reply auto-sets PENDING_AGENT (awaiting reply)', async () => {
    const { svc, tx } = make({ state: 'OPEN' });
    await svc.addMessage(customer, 't1', { body: 'help' } as any);
    expect(tx.ticket.update.mock.calls[0][0].data.state).toBe('PENDING_AGENT');
  });

  it('a staff reply auto-sets PENDING_CUSTOMER (awaiting customer)', async () => {
    const { svc, tx } = make({ state: 'OPEN' });
    await svc.addMessage(staff, 't1', { body: 'answer' } as any);
    expect(tx.ticket.update.mock.calls[0][0].data.state).toBe(
      'PENDING_CUSTOMER',
    );
  });

  it('a staff internal note does NOT change the customer-facing state', async () => {
    const { svc, tx } = make({ state: 'PENDING_AGENT' });
    await svc.addMessage(staff, 't1', { body: 'note', isInternal: true } as any);
    expect(tx.ticket.update.mock.calls[0][0].data.state).toBe('PENDING_AGENT');
  });

  it('deletes a ticket from an active state, closing it first', async () => {
    const { svc, tx } = make({ state: 'OPEN' });
    const res = await svc.deleteTicket(staff, 't1');
    expect(tx.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { state: 'CLOSED' } }),
    );
    expect(tx.ticket.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    expect(res).toEqual({ id: 't1' });
  });

  it('delete on an already-closed ticket skips the redundant close', async () => {
    const { svc, tx } = make({ state: 'CLOSED' });
    await svc.deleteTicket(staff, 't1');
    expect(tx.ticket.update).not.toHaveBeenCalled();
    expect(tx.ticket.delete).toHaveBeenCalled();
  });

  it('a customer cannot delete a ticket', async () => {
    const { svc } = make({ state: 'OPEN' });
    await expect(svc.deleteTicket(customer, 't1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
