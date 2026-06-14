import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'server_permissions';

/**
 * Per-server permission strings checked by PermissionGuard against SubUser
 * grants (the owner and platform admins always pass). Examples:
 * "control.console", "control.start", "file.read", "backup.create".
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
