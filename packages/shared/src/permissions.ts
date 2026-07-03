/**
 * Canonical per-server SubUser permission strings.
 *
 * The panel's PermissionGuard (`apps/panel-api/src/auth/guards`) checks these
 * against `SubUser.permissions`. Server owners and ADMIN/OWNER global roles
 * implicitly hold every permission. The web panel uses this list to render the
 * sub-user permission editor.
 *
 * Wildcards: a grant of `files.*` implies every `files.<x>` permission.
 */

export const ServerPermission = {
  // Base visibility. Implicitly held by every ACTIVE sub-user so the server
  // detail page loads; it is NOT shown in the editor and cannot be revoked.
  SERVER_READ: 'server.read',

  // Console
  CONSOLE_READ: 'console.read',
  CONSOLE_COMMAND: 'console.command',

  // Power
  POWER_START: 'control.start',
  POWER_STOP: 'control.stop',
  POWER_RESTART: 'control.restart',
  POWER: 'control.power',
  REINSTALL: 'control.reinstall',
  RESIZE: 'control.resize',
  SWITCH_GAME: 'control.switch-game',

  // Files
  FILES_READ: 'files.read',
  FILES_WRITE: 'files.write',
  FILES_DELETE: 'files.delete',
  FILES_ARCHIVE: 'files.archive',
  FILES_SFTP: 'files.sftp',

  // Backups
  BACKUP_READ: 'backup.read',
  BACKUP_CREATE: 'backup.create',
  BACKUP_RESTORE: 'backup.restore',
  BACKUP_DELETE: 'backup.delete',
  BACKUP_DOWNLOAD: 'backup.download',

  // Databases
  DATABASE_READ: 'database.read',
  DATABASE_CREATE: 'database.create',
  DATABASE_DELETE: 'database.delete',

  // Schedules
  SCHEDULE_READ: 'schedule.read',
  SCHEDULE_CREATE: 'schedule.create',
  SCHEDULE_UPDATE: 'schedule.update',
  SCHEDULE_DELETE: 'schedule.delete',

  // Allocations / network
  ALLOCATION_READ: 'allocation.read',
  ALLOCATION_CREATE: 'allocation.create',
  ALLOCATION_DELETE: 'allocation.delete',

  // Settings & variables
  SETTINGS_READ: 'settings.read',
  SETTINGS_UPDATE: 'settings.update',
  STARTUP_UPDATE: 'startup.update',

  // Sub-users
  SUBUSER_READ: 'subuser.read',
  SUBUSER_CREATE: 'subuser.create',
  SUBUSER_UPDATE: 'subuser.update',
  SUBUSER_DELETE: 'subuser.delete',
} as const;

export type ServerPermission =
  (typeof ServerPermission)[keyof typeof ServerPermission];

export const ALL_SERVER_PERMISSIONS: ServerPermission[] = Object.values(
  ServerPermission,
);

/** Permission groups for rendering the sub-user editor UI. */
export const PERMISSION_GROUPS: Record<string, ServerPermission[]> = {
  Console: [ServerPermission.CONSOLE_READ, ServerPermission.CONSOLE_COMMAND],
  Control: [
    ServerPermission.POWER_START,
    ServerPermission.POWER_STOP,
    ServerPermission.POWER_RESTART,
    ServerPermission.REINSTALL,
    ServerPermission.RESIZE,
    ServerPermission.SWITCH_GAME,
  ],
  Files: [
    ServerPermission.FILES_READ,
    ServerPermission.FILES_WRITE,
    ServerPermission.FILES_DELETE,
    ServerPermission.FILES_ARCHIVE,
    ServerPermission.FILES_SFTP,
  ],
  Backups: [
    ServerPermission.BACKUP_READ,
    ServerPermission.BACKUP_CREATE,
    ServerPermission.BACKUP_RESTORE,
    ServerPermission.BACKUP_DELETE,
    ServerPermission.BACKUP_DOWNLOAD,
  ],
  Databases: [
    ServerPermission.DATABASE_READ,
    ServerPermission.DATABASE_CREATE,
    ServerPermission.DATABASE_DELETE,
  ],
  Schedules: [
    ServerPermission.SCHEDULE_READ,
    ServerPermission.SCHEDULE_CREATE,
    ServerPermission.SCHEDULE_UPDATE,
    ServerPermission.SCHEDULE_DELETE,
  ],
  Network: [
    ServerPermission.ALLOCATION_READ,
    ServerPermission.ALLOCATION_CREATE,
    ServerPermission.ALLOCATION_DELETE,
  ],
  Settings: [
    ServerPermission.SETTINGS_READ,
    ServerPermission.SETTINGS_UPDATE,
    ServerPermission.STARTUP_UPDATE,
  ],
  'Sub-users': [
    ServerPermission.SUBUSER_READ,
    ServerPermission.SUBUSER_CREATE,
    ServerPermission.SUBUSER_UPDATE,
    ServerPermission.SUBUSER_DELETE,
  ],
};

/**
 * Permissions every ACTIVE sub-user holds implicitly — baseline read access to
 * the server object itself, so the panel's server pages load. The guard grants
 * these without them being present in `SubUser.permissions`, and they are never
 * shown in the editor. Everything else must be granted explicitly.
 */
export const IMPLICIT_SUBUSER_PERMISSIONS: ServerPermission[] = [
  ServerPermission.SERVER_READ,
];

/**
 * Human-readable label + one-line description for each grantable permission,
 * used to render the sub-user permission editor. Keep in sync with the enum;
 * SERVER_READ is intentionally omitted (implicit, never shown).
 */
export const PERMISSION_META: Record<string, { label: string; description: string }> = {
  [ServerPermission.CONSOLE_READ]: {
    label: 'View console',
    description: 'Read live console output and server logs.',
  },
  [ServerPermission.CONSOLE_COMMAND]: {
    label: 'Send commands',
    description: 'Run commands in the server console.',
  },
  [ServerPermission.POWER_START]: {
    label: 'Start',
    description: 'Start the server.',
  },
  [ServerPermission.POWER_STOP]: {
    label: 'Stop',
    description: 'Stop the server.',
  },
  [ServerPermission.POWER_RESTART]: {
    label: 'Restart',
    description: 'Restart the server.',
  },
  [ServerPermission.POWER]: {
    label: 'Full power control',
    description: 'Any power action (start, stop, restart, kill).',
  },
  [ServerPermission.REINSTALL]: {
    label: 'Reinstall',
    description: 'Reinstall the server — may overwrite existing files.',
  },
  [ServerPermission.RESIZE]: {
    label: 'Upgrade / resize',
    description: 'Change the server plan (CPU, RAM, disk).',
  },
  [ServerPermission.SWITCH_GAME]: {
    label: 'Switch game',
    description: 'Swap the game/template running on this server.',
  },
  [ServerPermission.FILES_READ]: {
    label: 'View & download files',
    description: 'Browse the file manager, read and download files.',
  },
  [ServerPermission.FILES_WRITE]: {
    label: 'Upload & edit files',
    description: 'Upload, create, edit, rename and move files.',
  },
  [ServerPermission.FILES_DELETE]: {
    label: 'Delete files',
    description: 'Permanently delete files and folders.',
  },
  [ServerPermission.FILES_ARCHIVE]: {
    label: 'Compress & extract',
    description: 'Create and unpack archives (zip/tar).',
  },
  [ServerPermission.FILES_SFTP]: {
    label: 'SFTP access',
    description: 'Connect to the server files over SFTP.',
  },
  [ServerPermission.BACKUP_READ]: {
    label: 'View backups',
    description: 'See the list of backups.',
  },
  [ServerPermission.BACKUP_CREATE]: {
    label: 'Create backups',
    description: 'Take new backups.',
  },
  [ServerPermission.BACKUP_RESTORE]: {
    label: 'Restore backups',
    description: 'Restore the server from a backup.',
  },
  [ServerPermission.BACKUP_DELETE]: {
    label: 'Delete backups',
    description: 'Permanently delete backups.',
  },
  [ServerPermission.BACKUP_DOWNLOAD]: {
    label: 'Download backups',
    description: 'Download backup archives.',
  },
  [ServerPermission.DATABASE_READ]: {
    label: 'View databases',
    description: 'See databases and their connection details.',
  },
  [ServerPermission.DATABASE_CREATE]: {
    label: 'Create databases',
    description: 'Provision new databases.',
  },
  [ServerPermission.DATABASE_DELETE]: {
    label: 'Delete databases',
    description: 'Permanently delete databases.',
  },
  [ServerPermission.SCHEDULE_READ]: {
    label: 'View schedules',
    description: 'See scheduled tasks.',
  },
  [ServerPermission.SCHEDULE_CREATE]: {
    label: 'Create schedules',
    description: 'Add scheduled tasks.',
  },
  [ServerPermission.SCHEDULE_UPDATE]: {
    label: 'Edit schedules',
    description: 'Modify scheduled tasks.',
  },
  [ServerPermission.SCHEDULE_DELETE]: {
    label: 'Delete schedules',
    description: 'Remove scheduled tasks.',
  },
  [ServerPermission.ALLOCATION_READ]: {
    label: 'View network',
    description: 'See allocated IPs and ports.',
  },
  [ServerPermission.ALLOCATION_CREATE]: {
    label: 'Add allocations',
    description: 'Assign additional ports to the server.',
  },
  [ServerPermission.ALLOCATION_DELETE]: {
    label: 'Remove allocations',
    description: 'Release ports from the server.',
  },
  [ServerPermission.SETTINGS_READ]: {
    label: 'View settings',
    description: 'Open the server settings, network and domains pages.',
  },
  [ServerPermission.SETTINGS_UPDATE]: {
    label: 'Edit settings',
    description: 'Rename the server and change its settings.',
  },
  [ServerPermission.STARTUP_UPDATE]: {
    label: 'Edit startup',
    description: 'Change startup command and environment variables.',
  },
  [ServerPermission.SUBUSER_READ]: {
    label: 'View sub-users',
    description: 'See who else has access to the server.',
  },
  [ServerPermission.SUBUSER_CREATE]: {
    label: 'Invite sub-users',
    description: 'Grant other people access to the server.',
  },
  [ServerPermission.SUBUSER_UPDATE]: {
    label: 'Edit sub-users',
    description: "Change another sub-user's permissions.",
  },
  [ServerPermission.SUBUSER_DELETE]: {
    label: 'Remove sub-users',
    description: 'Revoke another sub-user’s access.',
  },
};

/** All grantable strings a permission field may legitimately contain: the exact
 * catalog, any `<group>.*` area wildcard, and the global `*`. Used to validate
 * grants coming in from the API so typos (`file.read`) are rejected. */
export const GRANTABLE_PERMISSIONS: string[] = [
  '*',
  ...ALL_SERVER_PERMISSIONS,
  ...Array.from(
    new Set(ALL_SERVER_PERMISSIONS.map((p) => `${p.split('.')[0]}.*`)),
  ),
];

/** True if `p` is a valid grantable permission string (exact, area wildcard or `*`). */
export function isGrantablePermission(p: string): boolean {
  return GRANTABLE_PERMISSIONS.includes(p);
}

/**
 * Expand a granted permission set (which may contain `*` or `<group>.*`
 * wildcards) into the concrete list of permissions it satisfies, plus the
 * implicit baseline. The web uses this to gate UI with a simple `.includes`.
 */
export function expandServerPermissions(granted: string[]): string[] {
  const out = new Set<string>(IMPLICIT_SUBUSER_PERMISSIONS);
  if (granted.includes('*')) {
    for (const p of ALL_SERVER_PERMISSIONS) out.add(p);
    return [...out];
  }
  const wildcardGroups = new Set(
    granted.filter((g) => g.endsWith('.*')).map((g) => g.split('.')[0]),
  );
  for (const p of ALL_SERVER_PERMISSIONS) {
    if (granted.includes(p) || wildcardGroups.has(p.split('.')[0])) out.add(p);
  }
  return [...out];
}

/**
 * Returns true if `granted` satisfies `required`, honoring `<group>.*` wildcards.
 */
export function hasPermission(
  granted: string[],
  required: string,
): boolean {
  if (granted.includes(required)) return true;
  const group = required.split('.')[0];
  return granted.includes(`${group}.*`);
}
