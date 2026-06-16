import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from './permission.guard';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';

/**
 * Unit tests for the per-server PermissionGuard. Prisma is fully mocked; the
 * guard contains the authorization business logic (owner/admin override,
 * sub-user permission matching, API-key scope ceiling, denial paths).
 */
describe('PermissionGuard', () => {
  let prisma: {
    server: { findFirst: jest.Mock };
    subUser: { findFirst: jest.Mock };
  };
  let reflector: Reflector;
  let guard: PermissionGuard;

  const SERVER_ID = 'srv-1';
  const OWNER_ID = 'user-owner';

  beforeEach(() => {
    prisma = {
      server: { findFirst: jest.fn() },
      subUser: { findFirst: jest.fn() },
    };
    reflector = new Reflector();
    guard = new PermissionGuard(reflector, prisma as any);
  });

  /** Build a minimal HTTP ExecutionContext carrying user + route params. */
  function ctx(opts: {
    user?: any;
    params?: Record<string, any>;
    body?: Record<string, any>;
    required?: string[];
  }): ExecutionContext {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(opts.required ?? []);
    const req = {
      user: opts.user,
      params: opts.params ?? {},
      body: opts.body ?? {},
    };
    return {
      getType: () => 'http',
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  }

  it('throws when there is no authenticated user', async () => {
    await expect(
      guard.canActivate(ctx({ user: undefined, params: { serverId: SERVER_ID } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('passes through when the route carries no server scope', async () => {
    const result = await guard.canActivate(
      ctx({ user: { id: 'u1', globalRole: 'USER' }, params: {} }),
    );
    expect(result).toBe(true);
    expect(prisma.server.findFirst).not.toHaveBeenCalled();
  });

  it('does NOT grant platform ADMIN implicit access to a customer server', async () => {
    // Staff must use the admin panel; in the client area they are treated like
    // any other principal (owner/sub-user only).
    prisma.server.findFirst.mockResolvedValue({ id: SERVER_ID, ownerId: OWNER_ID });
    prisma.subUser.findFirst.mockResolvedValue(null);
    await expect(
      guard.canActivate(
        ctx({
          user: { id: 'admin', globalRole: 'ADMIN' },
          params: { serverId: SERVER_ID },
        }),
      ),
    ).rejects.toThrow('Not a member of this server');
  });

  it('does NOT grant platform OWNER implicit access to a customer server', async () => {
    prisma.server.findFirst.mockResolvedValue({ id: SERVER_ID, ownerId: OWNER_ID });
    prisma.subUser.findFirst.mockResolvedValue(null);
    await expect(
      guard.canActivate(
        ctx({
          user: { id: 'root', globalRole: 'OWNER' },
          params: { serverId: SERVER_ID },
        }),
      ),
    ).rejects.toThrow('Not a member of this server');
  });

  it('grants the server owner regardless of required permissions', async () => {
    prisma.server.findFirst.mockResolvedValue({ id: SERVER_ID, ownerId: OWNER_ID });
    const result = await guard.canActivate(
      ctx({
        user: { id: OWNER_ID, globalRole: 'USER' },
        params: { serverId: SERVER_ID },
        required: ['control.console', 'file.write'],
      }),
    );
    expect(result).toBe(true);
    expect(prisma.subUser.findFirst).not.toHaveBeenCalled();
  });

  it('resolves the server from the :id param when :serverId is absent', async () => {
    prisma.server.findFirst.mockResolvedValue({ id: SERVER_ID, ownerId: OWNER_ID });
    await guard.canActivate(
      ctx({ user: { id: OWNER_ID, globalRole: 'USER' }, params: { id: SERVER_ID } }),
    );
    expect(prisma.server.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SERVER_ID, deletedAt: null } }),
    );
  });

  it('resolves the server from the request body when no route param is present', async () => {
    prisma.server.findFirst.mockResolvedValue({ id: SERVER_ID, ownerId: OWNER_ID });
    await guard.canActivate(
      ctx({
        user: { id: OWNER_ID, globalRole: 'USER' },
        params: {},
        body: { serverId: SERVER_ID },
      }),
    );
    expect(prisma.server.findFirst).toHaveBeenCalled();
  });

  it('throws NotFound when the server does not exist (or is soft-deleted)', async () => {
    prisma.server.findFirst.mockResolvedValue(null);
    await expect(
      guard.canActivate(
        ctx({
          user: { id: 'u1', globalRole: 'USER' },
          params: { serverId: SERVER_ID },
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('grants an ACTIVE sub-user that holds all required permissions', async () => {
    prisma.server.findFirst.mockResolvedValue({ id: SERVER_ID, ownerId: OWNER_ID });
    prisma.subUser.findFirst.mockResolvedValue({
      permissions: ['control.console', 'control.start', 'file.read'],
    });
    const result = await guard.canActivate(
      ctx({
        user: { id: 'sub-1', globalRole: 'USER' },
        params: { serverId: SERVER_ID },
        required: ['control.console', 'file.read'],
      }),
    );
    expect(result).toBe(true);
  });

  it('denies a sub-user missing one of the required permissions', async () => {
    prisma.server.findFirst.mockResolvedValue({ id: SERVER_ID, ownerId: OWNER_ID });
    prisma.subUser.findFirst.mockResolvedValue({
      permissions: ['control.console'],
    });
    await expect(
      guard.canActivate(
        ctx({
          user: { id: 'sub-1', globalRole: 'USER' },
          params: { serverId: SERVER_ID },
          required: ['control.console', 'file.write'],
        }),
      ),
    ).rejects.toThrow(/Missing permissions: file\.write/);
  });

  it('grants a sub-user when no specific permissions are required (membership only)', async () => {
    prisma.server.findFirst.mockResolvedValue({ id: SERVER_ID, ownerId: OWNER_ID });
    prisma.subUser.findFirst.mockResolvedValue({ permissions: [] });
    const result = await guard.canActivate(
      ctx({
        user: { id: 'sub-1', globalRole: 'USER' },
        params: { serverId: SERVER_ID },
        required: [],
      }),
    );
    expect(result).toBe(true);
  });

  it('only matches ACTIVE sub-user memberships', async () => {
    prisma.server.findFirst.mockResolvedValue({ id: SERVER_ID, ownerId: OWNER_ID });
    prisma.subUser.findFirst.mockResolvedValue(null);
    await expect(
      guard.canActivate(
        ctx({
          user: { id: 'sub-1', globalRole: 'USER' },
          params: { serverId: SERVER_ID },
          required: ['control.console'],
        }),
      ),
    ).rejects.toThrow(/Not a member of this server/);
    expect(prisma.subUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { serverId: SERVER_ID, userId: 'sub-1', state: 'ACTIVE' },
      }),
    );
  });

  describe('API-key scope ceiling', () => {
    it('rejects a READ-scope key on a route requiring permissions', async () => {
      await expect(
        guard.canActivate(
          ctx({
            user: { id: 'u1', globalRole: 'USER', apiKeyScopes: ['READ'] },
            params: { serverId: SERVER_ID },
            required: ['control.start'],
          }),
        ),
      ).rejects.toThrow(/lacks write scope/);
    });

    it('allows a WRITE-scope key to proceed to the ownership check', async () => {
      prisma.server.findFirst.mockResolvedValue({ id: SERVER_ID, ownerId: OWNER_ID });
      const result = await guard.canActivate(
        ctx({
          user: { id: OWNER_ID, globalRole: 'USER', apiKeyScopes: ['WRITE'] },
          params: { serverId: SERVER_ID },
          required: ['control.start'],
        }),
      );
      expect(result).toBe(true);
    });

    it('does not enforce the scope ceiling when no permissions are required', async () => {
      prisma.server.findFirst.mockResolvedValue({ id: SERVER_ID, ownerId: OWNER_ID });
      const result = await guard.canActivate(
        ctx({
          user: { id: OWNER_ID, globalRole: 'USER', apiKeyScopes: ['READ'] },
          params: { serverId: SERVER_ID },
          required: [],
        }),
      );
      expect(result).toBe(true);
    });
  });

  it('reads required permissions from handler + class metadata', async () => {
    const spy = jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['control.console']);
    prisma.server.findFirst.mockResolvedValue({ id: SERVER_ID, ownerId: OWNER_ID });
    await guard.canActivate({
      getType: () => 'http',
      getHandler: () => 'handlerRef',
      getClass: () => 'classRef',
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: OWNER_ID, globalRole: 'USER' },
          params: { serverId: SERVER_ID },
        }),
      }),
    } as unknown as ExecutionContext);
    expect(spy).toHaveBeenCalledWith(PERMISSIONS_KEY, ['handlerRef', 'classRef']);
  });
});
