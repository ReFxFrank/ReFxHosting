import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ADMIN_PERMS_KEY } from '../../common/decorators/require-permission.decorator';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { hasAllPermissions, hasPermission, WILDCARD } from '../../common/permissions';

/**
 * Permission-based gate for the admin surface. Reads the route's
 * @RequirePerm() and checks it against the caller's effective permissions
 * (resolved in the JWT strategy from their RBAC role, or globalRole defaults).
 *
 * Routes with no declared permission still require the caller to be staff
 * (i.e. hold at least one admin permission) — customers are always rejected.
 */
@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<string[]>(ADMIN_PERMS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    const req =
      context.getType<'graphql'>() === 'graphql'
        ? GqlExecutionContext.create(context).getContext().req
        : context.switchToHttp().getRequest();
    const user: AuthUser | undefined = req?.user;
    if (!user) throw new ForbiddenException('Not authenticated');

    // API-key WRITE-scope ceiling on the admin surface: a scoped key inherits its
    // user's full RBAC permissions, so without this a READ-only key could drive
    // mutating admin actions. Require WRITE/ADMIN scope for mutating REST methods
    // (mirrors the per-server PermissionGuard); reads stay allowed with any scope.
    if (user.apiKeyScopes && context.getType<'graphql'>() !== 'graphql') {
      const method = (req?.method ?? 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
        const hasWrite = user.apiKeyScopes.some((s) => s === 'WRITE' || s === 'ADMIN');
        if (!hasWrite) throw new ForbiddenException('API key lacks write scope');
      }
    }

    const perms = user.permissions ?? [];

    if (required.length === 0) {
      if (hasPermission(perms, WILDCARD) || perms.length > 0) return true;
      throw new ForbiddenException('Staff access required');
    }
    if (hasAllPermissions(perms, required)) return true;
    throw new ForbiddenException('Insufficient permissions');
  }
}
