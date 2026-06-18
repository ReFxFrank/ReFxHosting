import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { GlobalRole } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { apiKeyAllows } from './api-key-permission.util';

/** Role hierarchy: OWNER > ADMIN > SUPPORT > CUSTOMER. */
const RANK: Record<GlobalRole, number> = {
  CUSTOMER: 0,
  SUPPORT: 1,
  ADMIN: 2,
  OWNER: 3,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<GlobalRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req =
      context.getType<'graphql'>() === 'graphql'
        ? GqlExecutionContext.create(context).getContext().req
        : context.switchToHttp().getRequest();
    const user: AuthUser | undefined = req?.user;
    if (!user) throw new ForbiddenException('Not authenticated');

    // Additive API-key path: a bot key carrying the route's @ApiPermissions
    // passes WITHOUT a broad GlobalRole. Humans have no apiKeyId → unchanged.
    if (apiKeyAllows(this.reflector, context, user)) return true;

    const minRequired = Math.min(...required.map((r) => RANK[r]));
    if (RANK[user.globalRole as GlobalRole] >= minRequired) return true;

    throw new ForbiddenException('Insufficient role');
  }
}
