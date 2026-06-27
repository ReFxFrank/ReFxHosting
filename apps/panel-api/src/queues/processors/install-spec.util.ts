import { Prisma } from '@prisma/client';
import { InstallSpec } from '../../agent/agent.client';
import { isJavaImage, resolveJavaImage } from '../../common/util/java-version.util';

/** First docker image (the "Default") from an egg's dockerImages map. */
function firstDockerImage(images: unknown): string | undefined {
  if (images && typeof images === 'object' && !Array.isArray(images)) {
    const values = Object.values(images as Record<string, unknown>);
    if (values.length) return String(values[0]);
  }
  return undefined;
}

/**
 * Resolve the RUNTIME image from the template on every (re)install, so an egg's
 * image fix (e.g. Arma 3 moving to a purpose-built games image) reaches existing
 * servers — whose stored dockerImage was set at creation. Minecraft's per-version
 * JVM is still resolved from MINECRAFT_VERSION; fixed-image games get the Default.
 */
function resolveRuntimeImage(
  images: unknown,
  env: Record<string, string>,
): string | undefined {
  const base = firstDockerImage(images);
  if (!base || !isJavaImage(base)) return base;
  return resolveJavaImage(base, env.MINECRAFT_VERSION ?? 'latest', 'jre');
}

/**
 * Resolves a server + its template + variable overrides into the concrete
 * InstallSpec the node agent consumes. Environment is layered:
 *   template defaults < server.environment < ServerVariable overrides.
 */
type ServerWithRelations = Prisma.ServerGetPayload<{
  include: {
    node: true;
    template: { include: { variables: true } };
    allocations: true;
    variables: true;
  };
}>;

/** Central Steam config → a login pair, or undefined when not fully set. */
export function steamLogin(cfg: {
  username: string;
  password: string;
}): { username: string; password: string; guardCode?: string } | undefined {
  return cfg.username && cfg.password
    ? { username: cfg.username, password: cfg.password }
    : undefined;
}

/**
 * Egg templates set the install container under `container`, but the node-agent's
 * InstallScript reads `image`. Map it through so an install can run in a DIFFERENT
 * image than the game runtime (e.g. a steamcmd downloader image to fetch the game,
 * then run it in a purpose-built game-runtime image). Unmapped, the agent falls
 * back to the runtime image for the install, which breaks games whose runtime
 * image lacks the install tooling (or vice-versa).
 */
function normalizeInstallScript(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const s = raw as Record<string, unknown>;
  const image = s.image ?? s.container;
  return image != null ? { ...s, image } : s;
}

export function buildInstallSpec(
  server: ServerWithRelations,
  opts: {
    wipe?: boolean;
    sftpPassword?: string;
    /** Host's Steam login — downloads the **game** server files (steamcmd
     *  +app_update) AND Workshop mods for games that aren't anonymous (e.g.
     *  Arma 3, DayZ). `guardCode` is a one-time Steam Guard code. */
    gameSteam?: { username: string; password: string; guardCode?: string };
    /** Extra (non-persisted) env injected for this job only, e.g. a one-time
     *  REFX_WORKSHOP_SYNC flag for a mods-only reinstall. Takes precedence. */
    extraEnv?: Record<string, string>;
  } = {},
): InstallSpec {
  const template = server.template!;

  const env: Record<string, string> = {};
  for (const v of template.variables) {
    if (v.defaultValue != null) env[v.envName] = v.defaultValue;
  }
  const serverEnv = (server.environment ?? {}) as Record<string, unknown>;
  for (const [k, val] of Object.entries(serverEnv)) {
    env[k] = String(val);
  }
  for (const ov of server.variables) {
    env[ov.envName] = ov.value;
  }
  // Per-job overrides (not persisted on the server) win over everything.
  for (const [k, v] of Object.entries(opts.extraEnv ?? {})) {
    env[k] = v;
  }

  // Steam Workshop appid + host game-download login for Workshop-enabled games.
  // The egg's install script uses these for both +app_update and Workshop
  // +workshop_download_item (one account, the host's — never a customer's).
  if (template.supportsWorkshop) {
    if (template.workshopAppId != null) {
      env.WORKSHOP_APP_ID = String(template.workshopAppId);
    }
    if (opts.gameSteam?.username && opts.gameSteam.password) {
      env.STEAM_GAME_USERNAME = opts.gameSteam.username;
      env.STEAM_GAME_PASSWORD = opts.gameSteam.password;
      if (opts.gameSteam.guardCode) env.STEAM_GAME_GUARD = opts.gameSteam.guardCode;
    }
  }

  return {
    serverId: server.id,
    shortId: server.shortId,
    dockerImage:
      resolveRuntimeImage(template.dockerImages, env) ??
      server.dockerImage ??
      undefined,
    deployMethod: server.deployMethod,
    startupCommand: server.startupCommand ?? template.startupCommand,
    startupDetect: template.startupDetect ?? '',
    stopCommand: template.stopCommand ?? '^C',
    environment: env,
    installScript: normalizeInstallScript(template.installScript),
    configFiles: template.configFiles,
    sftp: opts.sftpPassword
      ? { username: server.shortId, password: opts.sftpPassword }
      : undefined,
    wipe: opts.wipe ?? false,
    limits: {
      cpuCores: server.cpuCores,
      memoryMb: server.memoryMb,
      swapMb: server.swapMb,
      diskMb: server.diskMb,
      ioWeight: server.ioWeight,
    },
    allocations: server.allocations.map((a) => ({
      ip: a.ip,
      port: a.port,
      isPrimary: a.isPrimary,
    })),
  };
}
