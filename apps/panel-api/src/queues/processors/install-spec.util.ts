import { Prisma } from '@prisma/client';
import { InstallSpec } from '../../agent/agent.client';

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

export function buildInstallSpec(
  server: ServerWithRelations,
  opts: {
    wipe?: boolean;
    sftpPassword?: string;
    /** Steam login, injected for Workshop-enabled templates so the egg's steamcmd
     *  install can authenticate (anonymous can't fetch many Workshop items).
     *  `guardCode` is a one-time Steam Guard code for the login. Never set for
     *  non-Workshop games. */
    steam?: { username: string; password: string; guardCode?: string };
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

  // Steam Workshop appid + central login for Workshop-enabled games (the egg's
  // install script reads these to run `steamcmd +login … +workshop_download_item`).
  if (template.supportsWorkshop) {
    if (template.workshopAppId != null) {
      env.WORKSHOP_APP_ID = String(template.workshopAppId);
    }
    if (opts.steam?.username && opts.steam.password) {
      env.STEAM_USERNAME = opts.steam.username;
      env.STEAM_PASSWORD = opts.steam.password;
      if (opts.steam.guardCode) env.STEAM_GUARD_CODE = opts.steam.guardCode;
    }
  }

  return {
    serverId: server.id,
    shortId: server.shortId,
    dockerImage: server.dockerImage ?? undefined,
    deployMethod: server.deployMethod,
    startupCommand: server.startupCommand ?? template.startupCommand,
    startupDetect: template.startupDetect ?? '',
    stopCommand: template.stopCommand ?? '^C',
    environment: env,
    installScript: template.installScript,
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
