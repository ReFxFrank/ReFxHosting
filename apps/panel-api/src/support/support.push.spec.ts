import { SupportService } from './support.service';

/**
 * The support-reply → APNs push wiring. A staff reply on a customer's ticket
 * must push `support.reply` + ticketId (with a short preview) to the requester,
 * and must NOT push when the staff author is also the requester.
 */
describe('SupportService support-reply push', () => {
  function make() {
    const prisma = { user: { findMany: jest.fn().mockResolvedValue([]) } };
    const notifications = {
      createNotification: jest.fn().mockResolvedValue(undefined),
      notifyMany: jest.fn().mockResolvedValue(undefined),
    };
    const push = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    const svc = new SupportService(prisma as any, notifications as any, push as any);
    return { push, svc };
  }

  const ticket = { id: 't1', number: 42, subject: 'Help', requesterId: 'cust1', assigneeId: null };

  it('pushes support.reply + ticketId + preview to the requester on a staff reply', async () => {
    const { push, svc } = make();
    const staff = { id: 'staff1', email: 's@x' };
    await (svc as any).notifyTicketReply(ticket, staff, true, 'Here is the fix — restart and retry.');
    expect(push.sendToUser).toHaveBeenCalledWith(
      'cust1',
      expect.objectContaining({
        type: 'support.reply',
        data: { ticketId: 't1' },
        body: expect.stringContaining('restart'),
      }),
    );
  });

  it('does not push when the staff author IS the requester', async () => {
    const { push, svc } = make();
    const selfStaff = { id: 'cust1', email: 'c@x' }; // same id as requester
    await (svc as any).notifyTicketReply(ticket, selfStaff, true, 'note');
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('does not push to the requester on a CUSTOMER reply (that path notifies staff)', async () => {
    const { push, svc } = make();
    const customer = { id: 'cust1', email: 'c@x' };
    await (svc as any).notifyTicketReply(ticket, customer, false, 'any update?');
    expect(push.sendToUser).not.toHaveBeenCalled();
  });
});
