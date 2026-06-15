import { SetMetadata } from '@nestjs/common';
import type { AdminPermission } from '../permissions';

export const ADMIN_PERMS_KEY = 'admin_permissions';

/**
 * Declares the admin permission(s) a route requires. Enforced by
 * AdminPermissionGuard against the caller's effective permissions. Multiple
 * permissions are ALL required.
 */
export const RequirePerm = (...perms: AdminPermission[]) =>
  SetMetadata(ADMIN_PERMS_KEY, perms);
