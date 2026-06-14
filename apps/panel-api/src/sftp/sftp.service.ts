import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';

export interface SftpDetails {
  host: string;
  port: number;
  username: string;
}

@Injectable()
export class SftpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
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
      select: { id: true },
    });
    if (!server) throw new NotFoundException('Server not found');

    const password = this.crypto.token(18);
    await this.prisma.server.update({
      where: { id: serverId },
      data: { sftpPasswordEnc: this.crypto.encrypt(password) },
    });
    // TODO(impl): push the new credential to the node-agent's SFTP subsystem so
    // it takes effect on the next connection.
    return { password };
  }
}
