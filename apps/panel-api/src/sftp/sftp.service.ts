import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { NodeAgentClient } from '../agent/agent.client';

export interface SftpDetails {
  host: string;
  port: number;
  username: string;
}

@Injectable()
export class SftpService {
  private readonly logger = new Logger(SftpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly agent: NodeAgentClient,
  ) {}

  /** SFTP connection details (never the password). */
  async details(serverId: string): Promise<SftpDetails> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      include: { node: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    return {
      host: server.node.fqdn,
      port: server.node.sftpPort,
      username: server.shortId,
    };
  }

  /** Rotate the per-server SFTP password; returns the new plaintext once. */
  async rotate(serverId: string): Promise<{ password: string }> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      include: { node: true },
    });
    if (!server) throw new NotFoundException('Server not found');

    const password = this.crypto.token(18);
    await this.prisma.server.update({
      where: { id: serverId },
      data: { sftpPasswordEnc: this.crypto.encrypt(password) },
    });

    // Push the new credential to the node-agent so it works immediately. Best
    // effort: if the node is unreachable the agent re-seeds it on next boot.
    try {
      await this.agent.setSftpCredential(
        server.node,
        serverId,
        server.shortId,
        password,
      );
    } catch (e) {
      this.logger.warn(
        `SFTP rotate: could not push credential to agent for ${serverId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
    return { password };
  }
}
