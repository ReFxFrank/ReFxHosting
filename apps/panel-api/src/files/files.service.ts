import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Node, Server } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NodeAgentClient } from '../agent/agent.client';
import {
  ChmodDto,
  CompressDto,
  DecompressDto,
  DeleteFilesDto,
  MkdirDto,
  RenameFileDto,
  WriteFileDto,
} from './dto/files.dto';

/**
 * Server file manager. Every operation is a thin proxy to the node-agent's
 * jailed file manager (the agent enforces the per-server data-dir chroot).
 * Authorization is enforced upstream by PermissionGuard on the controller.
 */
@Injectable()
export class FilesService {
  /** Matches the node agent's signed-body cap (32 MiB) on /files/write. */
  private static readonly MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: NodeAgentClient,
  ) {}

  private async serverWithNode(
    serverId: string,
  ): Promise<Server & { node: Node }> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      include: { node: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    return server;
  }

  async list(serverId: string, path: string) {
    const server = await this.serverWithNode(serverId);
    return this.agent.listFiles(server.node, serverId, path);
  }

  async contents(serverId: string, path: string) {
    const server = await this.serverWithNode(serverId);
    return this.agent.readFile(server.node, serverId, path);
  }

  async write(serverId: string, dto: WriteFileDto) {
    const server = await this.serverWithNode(serverId);
    return this.agent.writeFile(server.node, serverId, dto.path, dto.content);
  }

  async delete(serverId: string, dto: DeleteFilesDto) {
    const server = await this.serverWithNode(serverId);
    return this.agent.deleteFiles(server.node, serverId, dto.paths);
  }

  async rename(serverId: string, dto: RenameFileDto) {
    const server = await this.serverWithNode(serverId);
    return this.agent.renameFile(server.node, serverId, dto.from, dto.to);
  }

  async mkdir(serverId: string, dto: MkdirDto) {
    const server = await this.serverWithNode(serverId);
    return this.agent.mkdir(server.node, serverId, dto.path);
  }

  async chmod(serverId: string, dto: ChmodDto) {
    const server = await this.serverWithNode(serverId);
    return this.agent.chmod(server.node, serverId, dto.path, dto.mode);
  }

  async compress(serverId: string, dto: CompressDto) {
    const server = await this.serverWithNode(serverId);
    return this.agent.compressFiles(
      server.node,
      serverId,
      dto.paths,
      dto.destination,
    );
  }

  async decompress(serverId: string, dto: DecompressDto) {
    const server = await this.serverWithNode(serverId);
    return this.agent.decompressFile(server.node, serverId, dto.path);
  }

  async downloadUrl(serverId: string, path: string) {
    const server = await this.serverWithNode(serverId);
    return this.agent.fileDownloadUrl(server.node, serverId, path);
  }

  async uploadUrl(serverId: string, path: string) {
    const server = await this.serverWithNode(serverId);
    return this.agent.fileUploadUrl(server.node, serverId, path);
  }

  /**
   * Stream an uploaded file straight to the agent's jailed file manager. The
   * agent HMAC-verifies and caps the body at 32 MiB, so we reject anything
   * larger here with a clear message rather than letting the agent silently
   * truncate the body into a signature failure.
   */
  async upload(serverId: string, path: string, bytes: Buffer) {
    if (!path || !path.trim()) {
      throw new BadRequestException('Destination path is required');
    }
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      throw new BadRequestException('Empty upload');
    }
    if (bytes.length > FilesService.MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException(
        'File exceeds the 32 MiB direct-upload limit. Use SFTP for larger files.',
      );
    }
    const server = await this.serverWithNode(serverId);
    await this.agent.uploadFileBytes(server.node, serverId, path, bytes);
    return { status: 'uploaded', path, bytes: bytes.length };
  }
}
