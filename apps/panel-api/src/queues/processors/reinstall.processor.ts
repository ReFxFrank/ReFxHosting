import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NodeAgentClient } from '../../agent/agent.client';
import { CryptoService } from '../../common/crypto/crypto.service';
import { SettingsService } from '../../platform/settings.service';
import { JOB, QUEUE, ReinstallJob } from '../queue.constants';
import { buildInstallSpec, steamLogin } from './install-spec.util';

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
    const { serverId, preserveData, gameSwitchLogId, workshopSync } = job.data;
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
    // Two Steam logins for Workshop games: the HOST's account downloads the game
    // (admin → Settings → Steam), the CUSTOMER's own account downloads mods.
    const ws = server.template.supportsWorkshop;
    const steamCfg = ws ? await this.settings.steamConfig() : undefined;
    const gameSteam = steamCfg ? steamLogin(steamCfg) : undefined;
    if (gameSteam && steamCfg?.guardCode) gameSteam.guardCode = steamCfg.guardCode;
    const steam =
      ws && server.steamUsername && server.steamPasswordEnc
        ? {
            username: server.steamUsername,
            password: this.crypto.decrypt(server.steamPasswordEnc),
            guardCode: server.steamGuardCode ?? undefined,
          }
        : undefined;
    const spec = buildInstallSpec(server, {
      wipe: !preserveData,
      sftpPassword,
      steam,
      gameSteam,
      // Mods-only Workshop sync: the egg skips re-validating the base game.
      extraEnv: workshopSync ? { REFX_WORKSHOP_SYNC: '1' } : undefined,
    });
    // One-time codes: clear them now they're baked into this install spec — the
    // per-server (mods) code on the server row and the central (game) code in
    // settings. Steam remembers the machine via its sentry file after first use.
    if (server.steamGuardCode) {
      await this.prisma.server.update({
        where: { id: serverId },
        data: { steamGuardCode: null },
      });
    }
    if (gameSteam?.guardCode) await this.settings.consumeSteamGuardCode();

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
