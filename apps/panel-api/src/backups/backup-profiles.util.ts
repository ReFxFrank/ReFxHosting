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
 * Palworld (SteamCMD app 2394010): SteamCMD re-downloads the entire dedicated
 * server on reinstall — the UE `Engine/`, the game binaries (`Pal/Binaries`),
 * and the multi-GB asset content (`Pal/Content`) — and our steamcmd bootstrap
 * plus Steam's depot metadata are pure scratch. Excluding them keeps an
 * essentials backup to what a redeploy actually needs: `Pal/Saved/` (SaveGames
 * + Config), which is tens of MB instead of the ~8 GB full install.
 *
 * SAFETY: every glob here is strictly more specific than `Pal/Saved` and none is
 * a prefix of it, so the agent's isIgnored (internal/backup/backup.go) keeps
 * `Pal/Saved/**` while pruning the excluded dirs whole. NEVER add `Pal` or
 * `Pal/Saved` here — that would drop the customer's world and config. (Like the
 * Minecraft profile, a restore onto a fresh/empty server expects a reinstall to
 * repopulate the excluded, re-downloadable content.)
 */
const PALWORLD_EXCLUDES = [
  ...GENERIC_EXCLUDES,
  'steamcmd', // our bootstrapped SteamCMD (refx shim) — re-created on install
  'steamapps', // Steam depot manifests / appmanifest — scratch
  'Engine', // Unreal Engine runtime — re-downloaded
  'Pal/Binaries', // server executables — re-downloaded
  'Pal/Content', // game assets (the bulk of the install) — re-downloaded
  'Pal/Plugins', // engine plugins — re-downloaded
];

/**
 * Palworld Windows/UE4SS egg (`palworld-windows`, the Windows build run under
 * Proton). Same re-downloadable game content as Linux, PLUS the Steam + Proton/
 * wine runtime, which is both huge AND contains a wine prefix whose `dosdevices`
 * symlinks (e.g. `z: -> /`) would otherwise bloat — or, on older agents, break —
 * the archive. We keep `Pal/Saved/` (world + config) and, unlike the Linux
 * profile, `Pal/Binaries/Win64/ue4ss/` (UE4SS + the customer's uploaded mods) —
 * only the ~152 MB game exe under Win64 is pruned, not the whole Binaries tree.
 *
 * SAFETY: as with PALWORLD_EXCLUDES, no glob here is `Pal`, `Pal/Saved`, or a
 * prefix of them, so the world/config always survive. `Pal/Content` is pruned,
 * which drops blueprint `.pak` mods under Content/Paks/LogicMods from an
 * essentials backup (re-addable); Lua/UE4SS mods under Win64/ue4ss are kept.
 */
const PALWORLD_WINDOWS_EXCLUDES = [
  ...GENERIC_EXCLUDES,
  'steamcmd', // bootstrapped SteamCMD — re-created on install
  'steamapps', // Steam depot metadata — scratch
  'Steam', // steamcmd's Steam client dir — scratch
  '.steam', // Proton/steamclient runtime + the wine prefix (compatdata) — scratch
  '.proton', // Proton compat prefix — scratch
  '.wine', // wine prefix — scratch (has dosdevices symlinks)
  'Engine', // Unreal Engine runtime — re-downloaded
  'Pal/Content', // game assets (the bulk) — re-downloaded
  'Pal/Plugins', // engine plugins — re-downloaded
  'Pal/Binaries/Win64/PalServer-Win64-Shipping.exe', // ~152 MB server exe — re-downloaded
];

/**
 * Exclude-globs for an "essentials" backup of the given server. Minecraft is
 * detected the same way as elsewhere in the panel (template slug prefix or
 * the MINECRAFT_VERSION env the unified egg always sets); other games use a
 * per-slug profile where one exists, else just the generic regenerables.
 */
export function essentialExcludes(
  templateSlug: string | null | undefined,
  environment: Record<string, unknown> | null | undefined,
): string[] {
  const slug = templateSlug ?? '';
  const isMinecraft =
    slug.startsWith('minecraft') ||
    (environment ?? {})['MINECRAFT_VERSION'] != null;
  if (isMinecraft) return [...MINECRAFT_EXCLUDES];
  if (slug === 'palworld') return [...PALWORLD_EXCLUDES];
  if (slug === 'palworld-windows') return [...PALWORLD_WINDOWS_EXCLUDES];
  return [...GENERIC_EXCLUDES];
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
