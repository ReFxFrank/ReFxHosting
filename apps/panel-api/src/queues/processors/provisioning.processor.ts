import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NodeAgentClient, InstallSpec } from '../../agent/agent.client';
import { CryptoService } from '../../common/crypto/crypto.service';
import { SettingsService } from '../../platform/settings.service';
import { JOB, ProvisionJob, QUEUE } from '../queue.constants';
import { buildInstallSpec } from './install-spec.util';

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

  async process(job: Job<ProvisionJob>): Promise<void> {
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
    // Prefer the customer's own Steam login for this server; fall back to the
    // optional central admin login. A one-time Steam Guard code rides along.
    const steam = server.template.supportsWorkshop
      ? server.steamUsername && server.steamPasswordEnc
        ? {
            username: server.steamUsername,
            password: this.crypto.decrypt(server.steamPasswordEnc),
            guardCode: server.steamGuardCode ?? undefined,
          }
        : await this.settings.steamConfig()
      : undefined;
    const spec: InstallSpec = buildInstallSpec(server, {
      wipe: true,
      sftpPassword,
      steam,
    });
    if (server.steamGuardCode) {
      await this.prisma.server.update({
        where: { id: serverId },
        data: { steamGuardCode: null },
      });
    }

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
}
