/**
 * Per-server SubUser permission catalog + helpers for the panel API.
 *
 * This is a local mirror of the canonical list in
 * `packages/shared/src/permissions.ts` (the two are kept in lock-step by hand,
 * matching the pattern used for the admin RBAC catalog in `./permissions.ts`).
 * The PermissionGuard, the sub-user DTO validators, and the server-detail
 * `viewerPermissions` projection all read from here so there is one vocabulary.
 */

export const ServerPermission = {
  // Base visibility — implicitly held by every ACTIVE sub-user (see below).
  SERVER_READ: "server.read",

  CONSOLE_READ: "console.read",
  CONSOLE_COMMAND: "console.command",

  POWER_START: "control.start",
  POWER_STOP: "control.stop",
  POWER_RESTART: "control.restart",
  POWER: "control.power",
  REINSTALL: "control.reinstall",
  RESIZE: "control.resize",
  SWITCH_GAME: "control.switch-game",

  FILES_READ: "files.read",
  FILES_WRITE: "files.write",
  FILES_DELETE: "files.delete",
  FILES_ARCHIVE: "files.archive",
  FILES_SFTP: "files.sftp",

  BACKUP_READ: "backup.read",
  BACKUP_CREATE: "backup.create",
  BACKUP_RESTORE: "backup.restore",
  BACKUP_DELETE: "backup.delete",
  BACKUP_DOWNLOAD: "backup.download",

  DATABASE_READ: "database.read",
  DATABASE_CREATE: "database.create",
  DATABASE_DELETE: "database.delete",

  SCHEDULE_READ: "schedule.read",
  SCHEDULE_CREATE: "schedule.create",
  SCHEDULE_UPDATE: "schedule.update",
  SCHEDULE_DELETE: "schedule.delete",

  ALLOCATION_READ: "allocation.read",
  ALLOCATION_CREATE: "allocation.create",
  ALLOCATION_DELETE: "allocation.delete",

  SETTINGS_READ: "settings.read",
  SETTINGS_UPDATE: "settings.update",
  STARTUP_UPDATE: "startup.update",

  SUBUSER_READ: "subuser.read",
  SUBUSER_CREATE: "subuser.create",
  SUBUSER_UPDATE: "subuser.update",
  SUBUSER_DELETE: "subuser.delete",
} as const;

export type ServerPermission =
  (typeof ServerPermission)[keyof typeof ServerPermission];

export const ALL_SERVER_PERMISSIONS: ServerPermission[] = Object.values(
  ServerPermission,
);

/**
 * Permissions every ACTIVE sub-user holds implicitly. Baseline read access to
 * the server object so the panel's server pages load; never stored on the grant
 * and never shown in the editor. Everything else must be granted explicitly.
 */
export const IMPLICIT_SUBUSER_PERMISSIONS: string[] = [
  ServerPermission.SERVER_READ,
];

/** Every string a `permissions` field may legitimately contain: the exact
 * catalog, any `<group>.*` area wildcard, and the global `*`. */
export const GRANTABLE_PERMISSIONS: string[] = [
  "*",
  ...ALL_SERVER_PERMISSIONS,
  ...Array.from(
    new Set(ALL_SERVER_PERMISSIONS.map((p) => `${p.split(".")[0]}.*`)),
  ),
];

/** True if `p` is a valid grantable permission string. */
export function isGrantablePermission(p: string): boolean {
  return GRANTABLE_PERMISSIONS.includes(p);
}

/**
 * True if a sub-user's `granted` set satisfies `required`, honoring `<group>.*`
 * and `*` wildcards and the implicit baseline. This is the authoritative check
 * the PermissionGuard uses for sub-users.
 */
export function hasServerPermission(
  granted: string[],
  required: string,
): boolean {
  if (IMPLICIT_SUBUSER_PERMISSIONS.includes(required)) return true;
  if (granted.includes("*")) return true;
  if (granted.includes(required)) return true;
  const group = required.split(".")[0];
  return granted.includes(`${group}.*`);
}

/**
 * Expand a granted set (which may contain `*` / `<group>.*`) into the concrete
 * list of permissions it satisfies, plus the implicit baseline. Sent to the web
 * as `viewerPermissions` so client-side gating is a simple `.includes`.
 */
export function expandServerPermissions(granted: string[]): string[] {
  const out = new Set<string>(IMPLICIT_SUBUSER_PERMISSIONS);
  if (granted.includes("*")) {
    for (const p of ALL_SERVER_PERMISSIONS) out.add(p);
    return [...out];
  }
  const wildcardGroups = new Set(
    granted.filter((g) => g.endsWith(".*")).map((g) => g.split(".")[0]),
  );
  for (const p of ALL_SERVER_PERMISSIONS) {
    if (granted.includes(p) || wildcardGroups.has(p.split(".")[0])) out.add(p);
  }
  return [...out];
}
