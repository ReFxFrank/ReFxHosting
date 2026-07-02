/**
 * Admin RBAC permission catalog. Each admin capability maps to one of these
 * granular permission strings. Roles carry a list of them (or the "*" wildcard).
 *
 * Keep in lock-step with the web catalog in apps/web/lib/permissions.ts.
 */
export const WILDCARD = "*";

export const ADMIN_PERMISSIONS = [
  "dashboard.read",
  "servers.read",
  "servers.manage",
  "nodes.read",
  "nodes.manage",
  "locations.manage",
  "users.read",
  "users.manage",
  // Granular user actions (each implied by the coarse `users.manage`). Let an
  // owner delegate exactly one capability — e.g. reset passwords but never ban.
  "users.create",
  "users.suspend", // suspend / ban / reactivate (account state)
  "users.delete", // delete / GDPR purge
  "users.credit", // grant / deduct store credit
  "users.password", // send reset link / set a temporary password
  "users.verify-email",
  "billing.read",
  "billing.manage",
  // Granular billing action (implied by `billing.manage`).
  "billing.refund", // refund a paid invoice
  "payments.manage",
  "catalog.manage",
  "content.manage",
  "support.read",
  "support.manage",
  "audit.read",
  "settings.manage",
  "roles.manage",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

/** Permission sets for the seeded system roles (mirror the GlobalRole hierarchy). */
export const SYSTEM_ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: [WILDCARD],
  admin: [
    "dashboard.read",
    "servers.read",
    "servers.manage",
    "nodes.read",
    "nodes.manage",
    "locations.manage",
    "users.read",
    "users.manage",
    "billing.read",
    "billing.manage",
    "catalog.manage",
    "content.manage",
    "support.read",
    "support.manage",
    "audit.read",
    "settings.manage",
  ],
  support: [
    "dashboard.read",
    "support.read",
    "support.manage",
    "users.read",
    "servers.read",
  ],
  customer: [],
};

/**
 * True if `perms` grants `required`. Hierarchy (each rung implies the next):
 *   - `*`                — owner: everything
 *   - exact match        — the granular grant itself
 *   - `<area>.*`         — an explicit area wildcard
 *   - `<area>.manage`    — the coarse "manage this area" grant implies every
 *                          granular action under it (e.g. users.manage ⊇
 *                          users.suspend/users.delete/users.read/…)
 *
 * This keeps every pre-existing role and the seeded system roles working after
 * a coarse permission is split into finer actions — nothing needs re-granting.
 */
export function hasPermission(perms: string[], required: string): boolean {
  if (perms.includes(WILDCARD) || perms.includes(required)) return true;
  const area = required.split(".")[0];
  if (perms.includes(`${area}.*`)) return true;
  // `<area>.manage` grants everything in the area (but "manage" is not itself
  // implied by anything narrower — a read/action-only role stays scoped).
  if (required !== `${area}.manage` && perms.includes(`${area}.manage`)) {
    return true;
  }
  return false;
}

/** True if `perms` grants every one of `required`. */
export function hasAllPermissions(
  perms: string[],
  required: string[],
): boolean {
  return required.every((r) => hasPermission(perms, r));
}

export type GlobalRoleName = "OWNER" | "ADMIN" | "SUPPORT" | "CUSTOMER";

/** Derive the coarse global-role tier a permission set (and optional key) implies. */
export function deriveGlobalRole(
  permissions: string[],
  key?: string,
): GlobalRoleName {
  if (key === "owner") return "OWNER";
  if (key === "admin") return "ADMIN";
  if (key === "support") return "SUPPORT";
  if (key === "customer") return "CUSTOMER";
  if (
    permissions.includes(WILDCARD) ||
    permissions.includes("roles.manage") ||
    permissions.includes("payments.manage")
  ) {
    return "OWNER";
  }
  if (permissions.some((p) => p.endsWith(".manage"))) return "ADMIN";
  // Any other granted admin permission — a granular action (users.suspend,
  // billing.refund, …) or a `.read` — makes the holder at least staff, so the
  // web treats them as staff and the admin chrome renders. The authoritative
  // check is still the per-route permission, not this coarse tier.
  if (permissions.length > 0) return "SUPPORT";
  return "CUSTOMER";
}

/** Default permissions for a user with no assigned RBAC role (legacy fallback). */
export function permissionsForGlobalRole(role: string): string[] {
  switch (role) {
    case "OWNER":
      return SYSTEM_ROLE_PERMISSIONS.owner;
    case "ADMIN":
      return SYSTEM_ROLE_PERMISSIONS.admin;
    case "SUPPORT":
      return SYSTEM_ROLE_PERMISSIONS.support;
    default:
      return SYSTEM_ROLE_PERMISSIONS.customer;
  }
}
