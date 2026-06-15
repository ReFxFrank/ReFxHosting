/**
 * Admin RBAC permission catalog. Each admin capability maps to one of these
 * granular permission strings. Roles carry a list of them (or the "*" wildcard).
 *
 * Keep in lock-step with the web catalog in apps/web/lib/permissions.ts.
 */
export const WILDCARD = '*';

export const ADMIN_PERMISSIONS = [
  'dashboard.read',
  'servers.read',
  'servers.manage',
  'nodes.read',
  'nodes.manage',
  'locations.manage',
  'users.read',
  'users.manage',
  'billing.read',
  'billing.manage',
  'payments.manage',
  'catalog.manage',
  'content.manage',
  'audit.read',
  'settings.manage',
  'roles.manage',
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

/** Permission sets for the seeded system roles (mirror the GlobalRole hierarchy). */
export const SYSTEM_ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: [WILDCARD],
  admin: [
    'dashboard.read',
    'servers.read',
    'servers.manage',
    'nodes.read',
    'nodes.manage',
    'locations.manage',
    'users.read',
    'users.manage',
    'billing.read',
    'billing.manage',
    'catalog.manage',
    'content.manage',
    'audit.read',
    'settings.manage',
  ],
  support: ['dashboard.read', 'users.read', 'servers.read'],
  customer: [],
};

/** True if `perms` grants `required` (directly or via the "*" wildcard). */
export function hasPermission(perms: string[], required: string): boolean {
  return perms.includes(WILDCARD) || perms.includes(required);
}

/** True if `perms` grants every one of `required`. */
export function hasAllPermissions(perms: string[], required: string[]): boolean {
  return required.every((r) => hasPermission(perms, r));
}

export type GlobalRoleName = 'OWNER' | 'ADMIN' | 'SUPPORT' | 'CUSTOMER';

/** Derive the coarse global-role tier a permission set (and optional key) implies. */
export function deriveGlobalRole(
  permissions: string[],
  key?: string,
): GlobalRoleName {
  if (key === 'owner') return 'OWNER';
  if (key === 'admin') return 'ADMIN';
  if (key === 'support') return 'SUPPORT';
  if (key === 'customer') return 'CUSTOMER';
  if (
    permissions.includes(WILDCARD) ||
    permissions.includes('roles.manage') ||
    permissions.includes('payments.manage')
  ) {
    return 'OWNER';
  }
  if (permissions.some((p) => p.endsWith('.manage'))) return 'ADMIN';
  if (permissions.some((p) => p.endsWith('.read'))) return 'SUPPORT';
  return 'CUSTOMER';
}

/** Default permissions for a user with no assigned RBAC role (legacy fallback). */
export function permissionsForGlobalRole(role: string): string[] {
  switch (role) {
    case 'OWNER':
      return SYSTEM_ROLE_PERMISSIONS.owner;
    case 'ADMIN':
      return SYSTEM_ROLE_PERMISSIONS.admin;
    case 'SUPPORT':
      return SYSTEM_ROLE_PERMISSIONS.support;
    default:
      return SYSTEM_ROLE_PERMISSIONS.customer;
  }
}
