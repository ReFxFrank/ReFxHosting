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
  opts: { wipe?: boolean } = {},
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

  return {
    serverId: server.id,
    dockerImage: server.dockerImage ?? undefined,
    deployMethod: server.deployMethod,
    startupCommand: server.startupCommand ?? template.startupCommand,
    environment: env,
    installScript: template.installScript,
    configFiles: template.configFiles,
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
