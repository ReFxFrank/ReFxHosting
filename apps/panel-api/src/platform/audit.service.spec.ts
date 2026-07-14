import { AuditService } from './audit.service';

/**
 * The audit browser must show WHO acted (actor email/name), and must never
 * leak the rest of the User row (password hash, TOTP seed, address, …). These
 * tests lock the actor join to a strict whitelist select and verify the joined
 * rows flow through pagination unchanged.
 */
describe('AuditService.listAuditLogs', () => {
  function make(rows: unknown[] = [], total = rows.length) {
    const prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue(rows),
        count: jest.fn().mockResolvedValue(total),
      },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    } as any;
    return { svc: new AuditService(prisma), prisma };
  }

  const filter = (over: Record<string, unknown> = {}) =>
    ({ page: 1, pageSize: 25, skip: 0, take: 25, ...over }) as any;

  it('joins the actor with ONLY email/firstName/lastName selected', async () => {
    const { svc, prisma } = make();
    await svc.listAuditLogs(filter());

    const args = prisma.auditLog.findMany.mock.calls[0][0];
    // Exact-shape assertion: adding any further User field (or dropping the
    // select entirely, which would serialize the whole row incl. secrets)
    // fails this test.
    expect(args.include).toEqual({
      actor: { select: { email: true, firstName: true, lastName: true } },
    });
  });

  it('returns rows with the nested actor (and null for system entries)', async () => {
    const rows = [
      {
        id: 'a-1',
        actorId: 'u-1',
        action: 'server.power.start',
        targetType: 'Server',
        actor: { email: 'admin@refx.gg', firstName: 'Ada', lastName: null },
      },
      {
        id: 'a-2',
        actorId: null,
        action: 'billing.renewal',
        targetType: 'Subscription',
        actor: null, // system-generated — no acting user
      },
    ];
    const { svc } = make(rows);
    const res = await svc.listAuditLogs(filter());

    expect(res.data).toHaveLength(2);
    expect((res.data[0] as any).actor.email).toBe('admin@refx.gg');
    expect((res.data[1] as any).actor).toBeNull();
    expect(res.meta.total).toBe(2);
  });

  it('still applies the actor/target/action filters', async () => {
    const { svc, prisma } = make();
    await svc.listAuditLogs(
      filter({ actorId: 'u-9', targetType: 'Server', action: 'server.delete' }),
    );
    const args = prisma.auditLog.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      actorId: 'u-9',
      targetType: 'Server',
      action: 'server.delete',
    });
  });
});
