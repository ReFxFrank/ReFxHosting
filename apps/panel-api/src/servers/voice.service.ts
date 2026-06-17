import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NodeAgentClient } from '../agent/agent.client';

/** Shape persisted by the TeamSpeak launcher (refx-voice.json) on the volume. */
interface VoiceCreds {
  queryAdmin?: string;
  queryPassword?: string;
  queryPort?: number;
  privilegeKey?: string;
  slots?: number;
}

export interface VoiceInfo {
  /** Voice connection address customers use in the TeamSpeak client. */
  address: string | null;
  voicePort: number | null;
  /** Purchased slot count (enforced as virtualserver_maxclients on the server). */
  slots: number | null;
  /** True once the server has booted and written its admin credentials. */
  ready: boolean;
  queryAdmin: string | null;
  queryPassword: string | null;
  queryPort: number;
  /** First-boot ServerQuery admin privilege key (single-use in the TS client). */
  privilegeKey: string | null;
}

/**
 * Surfaces a TeamSpeak voice server's connection details and first-boot
 * ServerQuery admin credentials. The launcher (see teamspeak3 egg) writes those
 * to `refx-voice.json` on the volume; we read it on demand via the agent's jailed
 * file manager rather than persisting credentials in the panel database.
 */
@Injectable()
export class VoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: NodeAgentClient,
  ) {}

  async info(serverId: string): Promise<VoiceInfo> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      include: { node: true, template: true, allocations: true },
    });
    if (!server) throw new NotFoundException('Server not found');

    const slug = server.template?.slug ?? '';
    if (!slug.startsWith('teamspeak')) {
      throw new BadRequestException('This server is not a TeamSpeak voice server');
    }

    const primary =
      server.allocations.find((a) => a.isPrimary) ?? server.allocations[0];
    const address = primary ? `${primary.ip}:${primary.port}` : null;

    let creds: VoiceCreds | null = null;
    try {
      const res = await this.agent.readFile(server.node, serverId, 'refx-voice.json');
      // readFile returns the raw text for octet-stream responses; tolerate both.
      const raw =
        typeof res === 'string' ? res : ((res as { content?: string })?.content ?? '');
      if (raw.trim()) creds = JSON.parse(raw) as VoiceCreds;
    } catch {
      creds = null; // not provisioned/booted yet, node unreachable, or no file
    }

    return {
      address,
      voicePort: primary?.port ?? null,
      slots: server.slots ?? creds?.slots ?? null,
      ready: !!creds?.queryPassword,
      queryAdmin: creds?.queryAdmin ?? null,
      queryPassword: creds?.queryPassword ?? null,
      queryPort: creds?.queryPort ?? 10011,
      privilegeKey: creds?.privilegeKey ?? null,
    };
  }
}
