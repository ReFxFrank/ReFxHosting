import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NodeAgentClient, InstallSpec } from '../../agent/agent.client';
import { CryptoService } from '../../common/crypto/crypto.service';
import { SettingsService } from '../../platform/settings.service';
import { JOB, ProvisionJob, ReconfigureJob, QUEUE } from '../queue.constants';
import { buildInstallSpec, steamLogin } from './install-spec.util';

/**
 * Provisions a freshly-created server: instructs the node agent to pull the
 * image, run the install script and write config, then moves the server to
 * OFFLINE (ready to start). Retries with backoff via BullMQ default options.
 */
@Processor(QUEUE.PROVISIONING)
export class ProvisioningProcessor extends WorkerHost {
  private readonly logger = new Logger(ProvisioningProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: NodeAgentClient,
    private readonly crypto: CryptoService,
    private readonly settings: SettingsService,
  ) {
    super();
  }

  async process(job: Job<ProvisionJob | ReconfigureJob>): Promise<void> {
    if (job.name === JOB.RECONFIGURE) {
      await this.reconfigure(job.data.serverId);
      return;
    }
    if (job.name !== JOB.PROVISION) return;
    const { serverId } = job.data;
    this.logger.log(`provisioning ${serverId}`);

    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      include: {
        node: true,
        template: { include: { variables: true } },
        allocations: true,
        variables: true,
      },
    });
    if (!server || !server.template) {
      this.logger.warn(`server ${serverId} or template missing; aborting`);
      return;
    }

    const sftpPassword = server.sftpPasswordEnc
      ? this.crypto.decrypt(server.sftpPasswordEnc)
      : undefined;
    // The HOST game-download account downloads the game AND any Workshop mods.
    const ws = server.template.supportsWorkshop;
    const steamCfg = ws ? await this.settings.steamConfig() : undefined;
    const gameSteam = steamCfg ? steamLogin(steamCfg) : undefined;
    if (gameSteam && steamCfg?.guardCode) gameSteam.guardCode = steamCfg.guardCode;
    const spec: InstallSpec = buildInstallSpec(server, {
      wipe: true,
      sftpPassword,
      gameSteam,
    });
    if (gameSteam?.guardCode) await this.settings.consumeSteamGuardCode();

    try {
      await this.agent.install(server.node, spec);
    } catch (err) {
      const attempts = job.opts.attempts ?? 1;
      const lastAttempt = job.attemptsMade + 1 >= attempts;
      this.logger.error(
        `install failed for ${serverId} on node ${server.node?.name ?? server.nodeId} ` +
          `(attempt ${job.attemptsMade + 1}/${attempts}): ${(err as Error).message}`,
      );
      // On the final attempt, surface the failure instead of leaving the server
      // stuck on INSTALLING forever. CRASHED is visible to the owner/admin, who
      // can retry via reinstall once the node agent is reachable.
      if (lastAttempt) {
        await this.prisma.server.update({
          where: { id: serverId },
          data: { state: 'CRASHED' },
        });
      }
      throw err; // let BullMQ retry (until attempts exhausted) + record the failure
    }

    await this.prisma.server.update({
      where: { id: serverId },
      data: { state: 'OFFLINE' },
    });
    this.logger.log(`provisioned ${serverId} -> OFFLINE`);
  }

  /**
   * Push a server's current DB resource limits to its node agent live (no
   * reinstall). Used after a paid plan upgrade is applied to the DB, so the new
   * limits take effect once — and only once — payment has cleared.
   */
  private async reconfigure(serverId: string): Promise<void> {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      include: {
        node: true,
        template: { include: { variables: true } },
        allocations: true,
        variables: true,
      },
    });
    if (!server || !server.node) {
      this.logger.warn(`reconfigure: server ${serverId} or node missing; skipping`);
      return;
    }
    await this.agent.reconfigure(server.node, {
      serverId,
      limits: {
        cpuCores: server.cpuCores,
        memoryMb: server.memoryMb,
        swapMb: server.swapMb,
        diskMb: server.diskMb,
        ioWeight: server.ioWeight,
      },
    });
    // Also push the refreshed install spec: a RAM change alters the derived
    // SERVER_MEMORY (-Xmx), which lives in the spec's env — without this the
    // cgroup limit grows but the JVM heap stays at its old size forever.
    // Best-effort: the limits are already applied either way.
    if (server.template) {
      try {
        await this.agent.reloadServer(
          server.node,
          buildInstallSpec(server, { wipe: false }),
        );
      } catch (e) {
        this.logger.warn(
          `spec reload after reconfigure failed for ${serverId}: ${(e as Error).message}`,
        );
      }
    }
    this.logger.log(`reconfigured ${serverId} to new limits`);
  }
}
