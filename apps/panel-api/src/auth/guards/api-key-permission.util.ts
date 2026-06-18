import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_PERMISSIONS_KEY } from '../../common/decorators/api-permissions.decorator';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { hasAllPermissions } from '../../common/permissions';

/**
 * Shared API-key authorization path used by RolesGuard and PermissionGuard.
 *
 * Returns true ONLY when:
 *   - the principal authenticated via an API key (has `apiKeyId`), AND
 *   - the route declares @ApiPermissions(...), AND
 *   - the key carries ALL of those permissions (ApiKey.permissions).
 *
 * This is additive: a human (JWT) principal has no `apiKeyId`, so it always
 * returns false for them and the existing role / server checks are untouched.
 */
export function apiKeyAllows(
  reflector: Reflector,
  context: ExecutionContext,
  user: AuthUser | undefined,
): boolean {
  if (!user?.apiKeyId) return false;
  const apiPerms = reflector.getAllAndOverride<string[]>(API_PERMISSIONS_KEY, [
    context.getHandler(),
    context.getClass(),
  ]);
  if (!apiPerms || apiPerms.length === 0) return false;
  return hasAllPermissions(user.apiKeyPermissions ?? [], apiPerms);
}
