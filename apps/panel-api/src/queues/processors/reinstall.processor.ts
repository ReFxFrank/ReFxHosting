import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NodeAgentClient } from '../../agent/agent.client';
import { CryptoService } from '../../common/crypto/crypto.service';
import { SettingsService } from '../../platform/settings.service';
import { JOB, QUEUE, ReinstallJob } from '../queue.constants';
import { buildInstallSpec } from './install-spec.util';

/**
 * Handles both plain reinstalls and game switches (the latter carry a
 * gameSwitchLogId). It rebuilds the install spec from the server's CURRENT
 * template (already repointed by ServersService.switchGame) and tells the agent
 * to reinstall, wiping the data volume unless preserveData is set.
 */
@Processor(QUEUE.REINSTALL)
export class ReinstallProcessor extends WorkerHost {
  private readonly logger = new Logger(ReinstallProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: NodeAgentClient,
    private readonly crypto: CryptoService,
    private readonly settings: SettingsService,
  ) {
    super();
  }

  async process(job: Job<ReinstallJob>): Promise<void> {
    if (job.name !== JOB.REINSTALL) return;
    const { serverId, preserveData, gameSwitchLogId } = job.data;
    this.logger.log(
      `reinstall ${serverId}` +
        (gameSwitchLogId ? ` (game switch ${gameSwitchLogId})` : ''),
    );

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
      this.logger.warn(`server ${serverId} missing template; aborting reinstall`);
      return;
    }

    const sftpPassword = server.sftpPasswordEnc
      ? this.crypto.decrypt(server.sftpPasswordEnc)
      : undefined;
    // Prefer the customer's own Steam login for this server; fall back to the
    // optional central admin login.
    const steam = server.template.supportsWorkshop
      ? server.steamUsername && server.steamPasswordEnc
        ? {
            username: server.steamUsername,
            password: this.crypto.decrypt(server.steamPasswordEnc),
          }
        : await this.settings.steamConfig()
      : undefined;
    const spec = buildInstallSpec(server, {
      wipe: !preserveData,
      sftpPassword,
      steam,
    });

    try {
      await this.agent.reinstall(server.node, spec);
      await this.prisma.server.update({
        where: { id: serverId },
        data: { state: 'OFFLINE' },
      });
      this.logger.log(`reinstall complete for ${serverId}`);
    } catch (err) {
      // Surface failure on the server so the UI can show a CRASHED/errored
      // state; rethrow so BullMQ retries per the queue's attempt policy.
      await this.prisma.server.update({
        where: { id: serverId },
        data: { state: 'CRASHED' },
      });
      throw err;
    }
  }
}
