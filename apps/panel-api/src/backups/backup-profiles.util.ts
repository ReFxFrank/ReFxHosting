/**
 * Curated "essentials" backup profiles: exclude-globs for content that a
 * reinstall regenerates or re-downloads, so backups carry only what is
 * actually needed to redeploy the server (worlds, configs, mods/plugins,
 * player data). Exclude-list by design — anything we don't recognize is
 * KEPT, so an unknown file can never be silently lost.
 *
 * Glob semantics match the agent's isIgnored (internal/backup/backup.go):
 * a bare name matches that top-level file/dir (directories are pruned
 * whole), and patterns go through filepath.Match against the relative path.
 */

/** Regenerable content common to every game server. */
const GENERIC_EXCLUDES = [
  'logs',
  'crash-reports',
  'cache',
  '.cache',
  'tmp',
  'temp',
  '*.log',
];

/**
 * Minecraft (all loaders): the installer re-downloads the server/loader
 * libraries and version jars on reinstall; loader caches and mixin dumps are
 * pure noise. Worlds, mods, plugins, config/, server.properties, ops/
 * whitelist and player data are all kept.
 */
const MINECRAFT_EXCLUDES = [
  ...GENERIC_EXCLUDES,
  'libraries',
  'versions',
  '.fabric',
  '.mixin.out',
  'debug',
  'dumps',
];

/**
 * Exclude-globs for an "essentials" backup of the given server. Minecraft is
 * detected the same way as elsewhere in the panel (template slug prefix or
 * the MINECRAFT_VERSION env the unified egg always sets).
 */
export function essentialExcludes(
  templateSlug: string | null | undefined,
  environment: Record<string, unknown> | null | undefined,
): string[] {
  const isMinecraft =
    (templateSlug ?? '').startsWith('minecraft') ||
    (environment ?? {})['MINECRAFT_VERSION'] != null;
  return isMinecraft ? [...MINECRAFT_EXCLUDES] : [...GENERIC_EXCLUDES];
}

/** Merge profile + user globs, de-duplicated, empty entries dropped. */
export function mergeExcludes(
  profile: string[],
  user: string[] | undefined,
): string[] {
  return [
    ...new Set([...profile, ...(user ?? [])].map((g) => g.trim()).filter(Boolean)),
  ];
}
