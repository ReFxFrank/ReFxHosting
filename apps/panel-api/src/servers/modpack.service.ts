import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { JOB, ModpackInstallJob, QUEUE } from '../queues/queue.constants';
import { ModrinthService } from './modrinth.service';

const STOPPED = ['OFFLINE', 'CRASHED', 'STOPPED', 'INSTALLED', 'CREATED'];

/**
 * Modrinth modpack browser + installer. Search/version listing are synchronous
 * Modrinth proxies; the actual install is a background job (ModpackProcessor)
 * because it switches the server's loader/version and downloads many files.
 */
@Injectable()
export class ModpackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly modrinth: ModrinthService,
    @InjectQueue(QUEUE.MODPACK) private readonly modpackQueue: Queue,
  ) {}

  /** Load + validate the server is a unified-egg Minecraft server. */
  private async loadServer(serverId: string) {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      include: { template: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    const slug = server.template?.slug ?? '';
    if (slug !== 'minecraft') {
      throw new BadRequestException(
        'Modpacks require the unified Minecraft egg (switch the game to Minecraft first).',
      );
    }
    return server;
  }

  /** Search Modrinth modpacks. Not loader-filtered — installing one sets the loader. */
  async search(serverId: string, query: string) {
    await this.loadServer(serverId);
    return this.modrinth.search({
      query,
      loaderCategories: [],
      projectType: 'modpack',
      limit: 24,
    });
  }

  /** All versions of a modpack (newest first), each carrying its MC version + loader. */
  async versions(serverId: string, projectId: string) {
    await this.loadServer(serverId);
    return this.modrinth.projectVersions(projectId);
  }

  /** Queue a modpack install. The job switches loader/version, reinstalls, then writes files. */
  async install(
    serverId: string,
    versionId: string,
  ): Promise<{ accepted: true }> {
    const server = await this.loadServer(serverId);
    if (!STOPPED.includes(server.state) && server.state !== 'RUNNING') {
      throw new ConflictException(
        `Cannot install a modpack while the server is ${server.state}`,
      );
    }

    const version = await this.modrinth.version(versionId);
    const title = version.name || 'Modpack';

    // Optimistic state so the UI immediately reflects the in-progress install.
    await this.prisma.server.update({
      where: { id: serverId },
      data: { state: 'REINSTALLING' },
    });

    await this.modpackQueue.add(
      JOB.INSTALL_MODPACK,
      { serverId, versionId, title } satisfies ModpackInstallJob,
      { attempts: 1, removeOnComplete: 50, removeOnFail: 50 },
    );
    return { accepted: true };
  }
}
