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
    ServerPermission.SUBUSER_DELETE,
  ],
};

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
