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
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Per-server authorization. Resolves the target server from the `:serverId`
 * (or `:id`) route param and grants access when the principal is:
 *   - the server owner, or
 *   - an ACTIVE SubUser holding ALL required @RequirePermissions().
 *
 * NOTE: platform staff (ADMIN/OWNER) get NO implicit access to a customer's
 * server through the client area — they must use the admin panel. This keeps a
 * customer's servers private to them and the sub-users they invite.
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

    // Staff do NOT get an implicit override here — client-area server access is
    // owner/sub-user only. Staff manage customer servers via the admin panel.
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
