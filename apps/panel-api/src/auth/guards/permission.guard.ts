import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { hasPermission } from '../../common/permissions';
import { PrismaService } from '../../prisma/prisma.service';
import { apiKeyAllows } from './api-key-permission.util';

/**
 * Per-server authorization. Resolves the target server from the `:serverId`
 * (or `:id`) route param and grants access when the principal is:
 *   - staff holding the admin `servers.manage` capability (support access), or
 *   - the server owner, or
 *   - an ACTIVE SubUser holding ALL required @RequirePermissions().
 *
 * The staff override lets support operate a customer's server FROM THE ADMIN
 * PANEL. It is deliberately gated on `servers.manage` (ADMIN/OWNER by default),
 * NOT on global role alone, and a customer's servers never appear in a staff
 * member's OWN client dashboard/list (that query is scoped in ServersService).
 *
 * API-key principals are additionally constrained: a READ-scope key cannot pass
 * a guard that requires any non-read permission.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    const req =
      context.getType<'graphql'>() === 'graphql'
        ? GqlExecutionContext.create(context).getContext().req
        : context.switchToHttp().getRequest();
    const user: AuthUser | undefined = req?.user;
    if (!user) throw new ForbiddenException('Not authenticated');

    // Additive API-key path: a bot key carrying the route's @ApiPermissions
    // passes server READ routes that declare them, BEFORE the scope ceiling /
    // ownership checks. Routes without @ApiPermissions (e.g. power, files,
    // write actions) fall through and remain blocked for the bot (not owner,
    // not sub-user, scope ceiling). Humans have no apiKeyId → unchanged.
    if (apiKeyAllows(this.reflector, context, user)) return true;

    const serverId =
      req?.params?.serverId ?? req?.params?.id ?? req?.body?.serverId;
    if (!serverId) {
      // No server scope on this route; nothing to enforce here.
      return true;
    }

    // API-key scope ceiling.
    if (user.apiKeyScopes && required.length) {
      const hasWrite = user.apiKeyScopes.some((s) => s === 'WRITE' || s === 'ADMIN');
      if (!hasWrite) throw new ForbiddenException('API key lacks write scope');
    }

    // Staff support override: a principal whose admin RBAC grants `servers.manage`
    // (ADMIN/OWNER by default) may operate any server, so support can help a
    // customer from the admin panel. Read-only staff (servers.read only) and
    // customers fall through to the owner/sub-user checks below.
    if (hasPermission(user.permissions ?? [], 'servers.manage')) {
      return true;
    }

    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      select: { id: true, ownerId: true },
    });
    if (!server) throw new NotFoundException('Server not found');

    if (server.ownerId === user.id) return true;

    const sub = await this.prisma.subUser.findFirst({
      where: { serverId, userId: user.id, state: 'ACTIVE' },
      select: { permissions: true },
    });
    if (!sub) throw new ForbiddenException('Not a member of this server');

    const missing = required.filter((p) => !sub.permissions.includes(p));
    if (missing.length) {
      throw new ForbiddenException(`Missing permissions: ${missing.join(', ')}`);
    }
    return true;
  }
}
