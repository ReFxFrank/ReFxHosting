/**
 * Per-server sub-user permission catalog for the web panel — a local mirror of
 * `packages/shared/src/permissions.ts` (kept in lock-step by hand). Drives the
 * sub-user permission editor and gates the server tabs/actions a sub-user sees
 * against the `viewerPermissions` the API returns on the server detail payload.
 */

export const ServerPermission = {
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

export type PermissionMeta = { label: string; description: string };

/** Ordered groups of grantable permissions rendered in the editor. SERVER_READ
 * is intentionally excluded — it is implicit and cannot be revoked. */
export const PERMISSION_GROUPS: {
  group: string;
  hint: string;
  permissions: { key: string; label: string; description: string }[];
}[] = [
  {
    group: "Console",
    hint: "Live output and commands.",
    permissions: [
      { key: ServerPermission.CONSOLE_READ, label: "View console", description: "Read live console output and server logs." },
      { key: ServerPermission.CONSOLE_COMMAND, label: "Send commands", description: "Run commands in the server console." },
    ],
  },
  {
    group: "Power & control",
    hint: "Start/stop and lifecycle actions.",
    permissions: [
      { key: ServerPermission.POWER_START, label: "Start", description: "Start the server." },
      { key: ServerPermission.POWER_STOP, label: "Stop", description: "Stop the server." },
      { key: ServerPermission.POWER_RESTART, label: "Restart", description: "Restart the server." },
      { key: ServerPermission.REINSTALL, label: "Reinstall", description: "Reinstall the server — may overwrite files." },
      { key: ServerPermission.RESIZE, label: "Upgrade / resize", description: "Change the plan (CPU, RAM, disk)." },
      { key: ServerPermission.SWITCH_GAME, label: "Switch game", description: "Swap the game/template on this server." },
    ],
  },
  {
    group: "Files",
    hint: "File manager, uploads and downloads.",
    permissions: [
      { key: ServerPermission.FILES_READ, label: "View & download files", description: "Browse the file manager, read and download files." },
      { key: ServerPermission.FILES_WRITE, label: "Upload & edit files", description: "Upload, create, edit, rename and move files." },
      { key: ServerPermission.FILES_DELETE, label: "Delete files", description: "Permanently delete files and folders." },
      { key: ServerPermission.FILES_ARCHIVE, label: "Compress & extract", description: "Create and unpack archives (zip/tar)." },
      { key: ServerPermission.FILES_SFTP, label: "SFTP access", description: "Connect to the server files over SFTP." },
    ],
  },
  {
    group: "Backups",
    hint: "Snapshots of the server.",
    permissions: [
      { key: ServerPermission.BACKUP_READ, label: "View backups", description: "See the list of backups." },
      { key: ServerPermission.BACKUP_CREATE, label: "Create backups", description: "Take new backups." },
      { key: ServerPermission.BACKUP_RESTORE, label: "Restore backups", description: "Restore the server from a backup." },
      { key: ServerPermission.BACKUP_DELETE, label: "Delete backups", description: "Permanently delete backups." },
      { key: ServerPermission.BACKUP_DOWNLOAD, label: "Download backups", description: "Download backup archives." },
    ],
  },
  {
    group: "Databases",
    hint: "Managed databases.",
    permissions: [
      { key: ServerPermission.DATABASE_READ, label: "View databases", description: "See databases and connection details." },
      { key: ServerPermission.DATABASE_CREATE, label: "Create databases", description: "Provision new databases." },
      { key: ServerPermission.DATABASE_DELETE, label: "Delete databases", description: "Permanently delete databases." },
    ],
  },
  {
    group: "Schedules",
    hint: "Automated tasks.",
    permissions: [
      { key: ServerPermission.SCHEDULE_READ, label: "View schedules", description: "See scheduled tasks." },
      { key: ServerPermission.SCHEDULE_CREATE, label: "Create schedules", description: "Add scheduled tasks." },
      { key: ServerPermission.SCHEDULE_UPDATE, label: "Edit schedules", description: "Modify scheduled tasks." },
      { key: ServerPermission.SCHEDULE_DELETE, label: "Delete schedules", description: "Remove scheduled tasks." },
    ],
  },
  {
    group: "Network",
    hint: "IPs and ports.",
    permissions: [
      { key: ServerPermission.ALLOCATION_READ, label: "View network", description: "See allocated IPs and ports." },
      { key: ServerPermission.ALLOCATION_CREATE, label: "Add allocations", description: "Assign additional ports." },
      { key: ServerPermission.ALLOCATION_DELETE, label: "Remove allocations", description: "Release ports from the server." },
    ],
  },
  {
    group: "Settings & startup",
    hint: "Configuration and environment.",
    permissions: [
      { key: ServerPermission.SETTINGS_READ, label: "View settings", description: "Open settings, network and domains pages." },
      { key: ServerPermission.SETTINGS_UPDATE, label: "Edit settings", description: "Rename the server and change settings." },
      { key: ServerPermission.STARTUP_UPDATE, label: "Edit startup", description: "Change startup command and variables." },
    ],
  },
  {
    group: "Sub-users",
    hint: "Manage who else has access.",
    permissions: [
      { key: ServerPermission.SUBUSER_READ, label: "View sub-users", description: "See who else has access." },
      { key: ServerPermission.SUBUSER_CREATE, label: "Invite sub-users", description: "Grant other people access." },
      { key: ServerPermission.SUBUSER_UPDATE, label: "Edit sub-users", description: "Change another sub-user's permissions." },
      { key: ServerPermission.SUBUSER_DELETE, label: "Remove sub-users", description: "Revoke another sub-user's access." },
    ],
  },
];

/** Flat list of every grantable permission key (excludes implicit SERVER_READ). */
export const ALL_GRANTABLE_KEYS: string[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key),
);

/**
 * True if the viewer's effective permission set (`viewerPermissions` from the
 * server payload — already expanded server-side, but we honor wildcards here
 * too for safety) satisfies `required`.
 */
export function hasServerPermission(
  granted: string[] | undefined,
  required: string,
): boolean {
  if (!granted) return false;
  if (required === ServerPermission.SERVER_READ) return true;
  if (granted.includes("*") || granted.includes(required)) return true;
  return granted.includes(`${required.split(".")[0]}.*`);
}
