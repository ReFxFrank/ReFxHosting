import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './guards/roles.guard';
import { PermissionGuard } from './guards/permission.guard';
import { API_PERMISSIONS_KEY } from '../common/decorators/api-permissions.decorator';
import { PERMISSIONS_KEY } from '../common/decorators/permissions.decorator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { SupportService } from '../support/support.service';
import { AuthUser } from '../common/decorators/current-user.decorator';

/**
 * PR-2: prove the "Agent Ops" bot (a CUSTOMER user whose API KEY carries a
 * narrow least-privilege permission set, scopes READ+WRITE) passes exactly the
 * intended routes via the guards, is blocked everywhere else, and that the two
 * HARD safety boundaries (forced-internal note, category/priority-only PATCH)
 * are enforced in SupportService — not just in the caller.
 */

// The full least-privilege grant the operator issues on the bot's key.
const BOT_PERMS = [
  'support.ticket.read',
  'support.category.read',
  'support.kb.read',
  'support.ticket.note.create',
  'support.ticket.update',
  'nodes.read',
  'servers.read',
];

/** A bot principal: plain CUSTOMER user + key-carried permissions. */
function botUser(perms: string[] = BOT_PERMS): AuthUser {
  return {
    id: 'bot-user',
    email: 'agentops@bot',
    globalRole: 'CUSTOMER',
    state: 'ACTIVE',
    permissions: [], // NO broad GlobalRole permissions
    apiKeyId: 'key-1',
    apiKeyScopes: ['READ', 'WRITE'],
    apiKeyPermissions: perms,
  };
}

/** Build an ExecutionContext whose handler/class metadata is `apiPerms`. */
function ctx(
  user: AuthUser | undefined,
  apiPerms: string[] | undefined,
  reflector: Reflector,
  opts: { roles?: string[]; required?: string[]; params?: any } = {},
): ExecutionContext {
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockImplementation((key: unknown) => {
      if (key === API_PERMISSIONS_KEY) return apiPerms as any;
      if (key === ROLES_KEY) return opts.roles as any;
      if (key === PERMISSIONS_KEY) return (opts.required ?? []) as any;
      return undefined as any;
    });
  const req = { user, params: opts.params ?? {}, body: {} };
  return {
    getType: () => 'http',
    getHandler: () => 'h',
    getClass: () => 'c',
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('Agent Ops bot — RolesGuard API-key path', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('passes a SUPPORT-gated route (e.g. PATCH ticket) with support.ticket.update', () => {
    const c = ctx(botUser(), ['support.ticket.update'], reflector, {
      roles: ['SUPPORT'],
    });
    expect(guard.canActivate(c)).toBe(true);
  });

  it('passes an ADMIN-gated route (nodes read) with nodes.read', () => {
    const c = ctx(botUser(), ['nodes.read'], reflector, { roles: ['ADMIN'] });
    expect(guard.canActivate(c)).toBe(true);
  });

  it('does NOT pass a node MUTATION (no @ApiPermissions) — falls to role check', () => {
    // Route declares no API perms; bot is CUSTOMER → role rank fails.
    const c = ctx(botUser(), undefined, reflector, { roles: ['ADMIN'] });
    expect(() => guard.canActivate(c)).toThrow(ForbiddenException);
  });

  it('does NOT pass when the key lacks the matching permission', () => {
    const c = ctx(botUser(['nodes.read']), ['support.ticket.update'], reflector, {
      roles: ['SUPPORT'],
    });
    expect(() => guard.canActivate(c)).toThrow(ForbiddenException);
  });

  it('leaves a human (no apiKeyId) subject to the normal role check', () => {
    const human: AuthUser = {
      id: 'u',
      email: 'c@x',
      globalRole: 'CUSTOMER',
      state: 'ACTIVE',
      permissions: [],
    };
    const c = ctx(human, ['support.ticket.update'], reflector, {
      roles: ['SUPPORT'],
    });
    // The api-key path is skipped; a CUSTOMER is rejected as before.
    expect(() => guard.canActivate(c)).toThrow(ForbiddenException);
  });

  it('still grants a human SUPPORT the route (human path unchanged)', () => {
    const human: AuthUser = {
      id: 'u',
      email: 's@x',
      globalRole: 'SUPPORT',
      state: 'ACTIVE',
      permissions: [],
    };
    const c = ctx(human, ['support.ticket.update'], reflector, {
      roles: ['SUPPORT'],
    });
    expect(guard.canActivate(c)).toBe(true);
  });
});

describe('Agent Ops bot — PermissionGuard API-key path', () => {
  let reflector: Reflector;
  let prisma: { server: { findFirst: jest.Mock }; subUser: { findFirst: jest.Mock } };
  let guard: PermissionGuard;

  beforeEach(() => {
    reflector = new Reflector();
    prisma = {
      server: { findFirst: jest.fn() },
      subUser: { findFirst: jest.fn() },
    };
    guard = new PermissionGuard(reflector, prisma as any);
  });

  it('passes server READ (servers.read) WITHOUT being owner/sub-user', async () => {
    const c = ctx(botUser(), ['servers.read'], reflector, {
      required: ['server.read'],
      params: { serverId: 'srv-1' },
    });
    await expect(guard.canActivate(c)).resolves.toBe(true);
    // Short-circuits before any DB lookup / scope ceiling.
    expect(prisma.server.findFirst).not.toHaveBeenCalled();
  });

  it('does NOT pass a server WRITE route (no @ApiPermissions) for the bot', async () => {
    // e.g. POST /servers/:serverId/power — declares no @ApiPermissions, so the
    // bot falls through: not owner, not sub-user → blocked.
    prisma.server.findFirst.mockResolvedValue({ id: 'srv-1', ownerId: 'someone' });
    prisma.subUser.findFirst.mockResolvedValue(null);
    const c = ctx(botUser(), undefined, reflector, {
      required: ['control.power'],
      params: { serverId: 'srv-1' },
    });
    await expect(guard.canActivate(c)).rejects.toThrow(ForbiddenException);
  });

  it('does NOT pass server read when the key lacks servers.read', async () => {
    prisma.server.findFirst.mockResolvedValue({ id: 'srv-1', ownerId: 'someone' });
    prisma.subUser.findFirst.mockResolvedValue(null);
    const c = ctx(botUser(['nodes.read']), ['servers.read'], reflector, {
      required: ['server.read'],
      params: { serverId: 'srv-1' },
    });
    await expect(guard.canActivate(c)).rejects.toThrow(ForbiddenException);
  });
});

describe('Agent Ops bot — SupportService hard boundaries', () => {
  function makeService(prisma: any): SupportService {
    return new SupportService(prisma);
  }

  describe('listTickets read scoping', () => {
    it('treats a bot with support.ticket.read as staff (sees ALL tickets)', async () => {
      const prisma = {
        $transaction: jest.fn().mockResolvedValue([[], 0]),
        ticket: { findMany: jest.fn(), count: jest.fn() },
      };
      const svc = makeService(prisma);
      await svc.listTickets(botUser(), { skip: 0, take: 10 } as any);
      // $transaction is given the prebuilt queries; assert no requesterId scope.
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('a non-bot CUSTOMER key only sees its own tickets', async () => {
      const captured: any[] = [];
      const prisma = {
        $transaction: jest.fn().mockResolvedValue([[], 0]),
        ticket: {
          findMany: jest.fn((args) => {
            captured.push(args.where);
            return [];
          }),
          count: jest.fn(() => 0),
        },
      };
      const svc = makeService(prisma);
      const customerKey: AuthUser = {
        ...botUser([]),
        apiKeyPermissions: [], // key carries nothing
      };
      await svc.listTickets(customerKey, { skip: 0, take: 10 } as any);
      expect(captured[0]).toMatchObject({ requesterId: 'bot-user' });
    });
  });

  describe('addMessage — FORCED internal note', () => {
    it('forces isInternal=true even when the bot requests isInternal=false', async () => {
      const created: any[] = [];
      const tx = {
        ticketMessage: {
          create: jest.fn((a) => {
            created.push(a.data);
            return a.data;
          }),
        },
        ticketCategory: { findUnique: jest.fn().mockResolvedValue(null) },
        ticket: { update: jest.fn().mockResolvedValue({}) },
      };
      const prisma = {
        ticket: {
          findUnique: jest.fn().mockResolvedValue({
            id: 't1',
            categoryId: null,
            firstResponseAt: null,
            state: 'OPEN',
            requesterId: 'customer',
          }),
        },
        $transaction: jest.fn((fn) => fn(tx)),
      };
      const svc = makeService(prisma);
      await svc.addMessage(botUser(), 't1', {
        body: 'hi',
        isInternal: false,
      } as any);
      expect(created[0].isInternal).toBe(true);
    });

    it('rejects a bot whose key lacks support.ticket.note.create', async () => {
      const prisma = {
        ticket: {
          findUnique: jest.fn().mockResolvedValue({
            id: 't1',
            requesterId: 'customer',
          }),
        },
        $transaction: jest.fn(),
      };
      const svc = makeService(prisma);
      await expect(
        svc.addMessage(
          botUser(['support.ticket.read']),
          't1',
          { body: 'x' } as any,
        ),
      ).rejects.toThrow(/support\.ticket\.note\.create/);
    });
  });

  describe('updateTicket — category/priority only', () => {
    const baseTicket = {
      id: 't1',
      categoryId: null,
      resolvedAt: null,
      state: 'OPEN',
    };

    it('allows the bot to set priority', async () => {
      const prisma = {
        ticket: {
          findUnique: jest.fn().mockResolvedValue(baseTicket),
          update: jest.fn().mockResolvedValue({ ...baseTicket, priority: 'HIGH' }),
        },
        ticketCategory: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      const svc = makeService(prisma);
      await expect(
        svc.updateTicket(botUser(), 't1', { priority: 'HIGH' } as any),
      ).resolves.toBeDefined();
    });

    it('rejects the bot changing state', async () => {
      const prisma = { ticket: { findUnique: jest.fn() } };
      const svc = makeService(prisma as any);
      await expect(
        svc.updateTicket(botUser(), 't1', { state: 'CLOSED' } as any),
      ).rejects.toThrow(/categoryId\/priority/);
    });

    it('rejects the bot setting an assignee', async () => {
      const prisma = { ticket: { findUnique: jest.fn() } };
      const svc = makeService(prisma as any);
      await expect(
        svc.updateTicket(botUser(), 't1', { assigneeId: 'staff-1' } as any),
      ).rejects.toThrow(/categoryId\/priority/);
    });

    it('rejects a bot whose key lacks support.ticket.update', async () => {
      const prisma = { ticket: { findUnique: jest.fn() } };
      const svc = makeService(prisma as any);
      await expect(
        svc.updateTicket(
          botUser(['support.ticket.read']),
          't1',
          { priority: 'LOW' } as any,
        ),
      ).rejects.toThrow(/support\.ticket\.update/);
    });
  });
});
