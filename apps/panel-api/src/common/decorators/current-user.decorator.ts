import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

/**
 * The authenticated principal attached to the request by the auth guards.
 * Mirrors the JWT access-token claims plus the resolved DB role/state.
 */
export interface AuthUser {
  id: string;
  email: string;
  globalRole: string;
  state: string;
  /**
   * True when an admin set a temporary password and the user has not yet
   * chosen a new one. While true, the global PasswordChangeInterceptor blocks
   * every route except the password-change allowlist (see
   * common/interceptors/password-change.interceptor.ts).
   */
  mustChangePassword?: boolean;
  /** Effective admin permissions (from the assigned RBAC role, or role defaults). */
  permissions: string[];
  /** Present when the request authenticated via an API key. */
  apiKeyId?: string;
  apiKeyScopes?: string[];
}

function extractRequest(ctx: ExecutionContext): any {
  if (ctx.getType<'graphql'>() === 'graphql') {
    return GqlExecutionContext.create(ctx).getContext().req;
  }
  return ctx.switchToHttp().getRequest();
}

/**
 * `@CurrentUser()` — injects the authenticated user (works for REST + GraphQL).
 * `@CurrentUser('id')` — injects a single property.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const req = extractRequest(ctx);
    const user: AuthUser | undefined = req?.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
