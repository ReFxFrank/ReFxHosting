import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
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

  /** Signed browser downloads stay valid this long (one click's worth). */
  private static readonly DOWNLOAD_TTL_SECONDS = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: NodeAgentClient,
    private readonly config: ConfigService,
  ) {}

  /** HMAC key for signed download URLs (derived from the secrets key). */
  private downloadKey(): string {
    const key = this.config.get<string>('secretsEncKey') ?? process.env.SECRETS_ENC_KEY ?? '';
    if (!key) throw new BadRequestException('Downloads are not configured');
    return `file-download:${key}`;
  }

  private downloadSig(serverId: string, path: string, exp: number): string {
    return createHmac('sha256', this.downloadKey())
      .update(`${serverId}\n${path}\n${exp}`)
      .digest('hex');
  }

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
    // The agent requires a destination archive path — an empty dest resolves to
    // the server root and fails with "is a directory". Default to a timestamped
    // zip next to the first source so the web's one-click Compress just works.
    let destination = dto.destination?.trim();
    if (!destination) {
      const first = dto.paths[0].replace(/\/+$/, '');
      const slash = first.lastIndexOf('/');
      const dir = slash > 0 ? first.slice(0, slash + 1) : '';
      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      destination = `${dir}archive-${stamp}.zip`;
    } else if (!/\.(zip|tar\.gz|tgz)$/i.test(destination)) {
      destination = `${destination}.zip`;
    }
    return this.agent.compressFiles(
      server.node,
      serverId,
      dto.paths,
      destination,
    );
  }

  async decompress(serverId: string, dto: DecompressDto) {
    const server = await this.serverWithNode(serverId);
    return this.agent.decompressFile(server.node, serverId, dto.path);
  }

  /**
   * Mint a short-lived signed URL for a browser download. The URL targets the
   * panel's own @Public /files/download route (a new tab can't send the JWT),
   * which verifies the HMAC and STREAMS the bytes from the agent — so large
   * files never buffer in panel memory and the agent stays fully authenticated.
   */
  async downloadUrl(serverId: string, path: string) {
    await this.serverWithNode(serverId); // 404 before minting for a dead server
    const clean = path.replace(/^\/+/, '');
    if (!clean || clean.includes('..')) {
      throw new BadRequestException('Invalid path');
    }
    const exp =
      Math.floor(Date.now() / 1000) + FilesService.DOWNLOAD_TTL_SECONDS;
    const sig = this.downloadSig(serverId, clean, exp);
    return {
      url:
        `/servers/${serverId}/files/download` +
        `?path=${encodeURIComponent(clean)}&exp=${exp}&sig=${sig}`,
    };
  }

  /** Verify a signed download and return the agent byte stream + filename. */
  async openSignedDownload(
    serverId: string,
    path: string,
    expStr: string,
    sig: string,
  ): Promise<{ stream: ReadableStream<Uint8Array>; filename: string }> {
    const clean = (path ?? '').replace(/^\/+/, '');
    const exp = Number(expStr);
    if (!clean || !Number.isFinite(exp) || !sig) {
      throw new ForbiddenException('Invalid download link');
    }
    if (exp < Math.floor(Date.now() / 1000)) {
      throw new ForbiddenException('Download link expired — request a new one');
    }
    const expected = this.downloadSig(serverId, clean, exp);
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Invalid download link');
    }
    const server = await this.serverWithNode(serverId);
    const stream = await this.agent.readFileStream(
      server.node,
      serverId,
      clean,
    );
    const filename = clean.split('/').pop() || 'download';
    return { stream, filename };
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
