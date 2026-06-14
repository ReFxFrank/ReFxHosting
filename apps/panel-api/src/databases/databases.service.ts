import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ServerDatabase } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { uuidv7 } from '../common/util/uuid';
import { CreateDatabaseDto } from './dto/databases.dto';

/** Default port per engine for the (TODO) shared DB host. */
const ENGINE_PORTS: Record<string, number> = {
  MYSQL: 3306,
  MARIADB: 3306,
  POSTGRESQL: 5432,
};

/** Public shape of a database (never exposes the stored password). */
export type SafeDatabase = Omit<ServerDatabase, 'passwordEnc'>;

@Injectable()
export class DatabasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  private strip(db: ServerDatabase): SafeDatabase {
    const { passwordEnc: _passwordEnc, ...rest } = db;
    return rest;
  }

  private async assertServer(serverId: string): Promise<void> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      select: { id: true },
    });
    if (!server) throw new NotFoundException('Server not found');
  }

  async list(serverId: string): Promise<SafeDatabase[]> {
    await this.assertServer(serverId);
    const rows = await this.prisma.serverDatabase.findMany({
      where: { serverId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.strip(r));
  }

  async create(
    serverId: string,
    dto: CreateDatabaseDto,
  ): Promise<SafeDatabase & { password: string }> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      select: { id: true, shortId: true },
    });
    if (!server) throw new NotFoundException('Server not found');

    const existing = await this.prisma.serverDatabase.findUnique({
      where: { serverId_name: { serverId, name: dto.name } },
    });
    if (existing) throw new ConflictException('Database name already in use');

    const password = this.crypto.token(18);
    const username = `s${server.shortId}_${dto.name}`.slice(0, 32);

    // TODO(impl): provision the actual database + grant on the shared DB host
    // (CREATE DATABASE / CREATE USER ... IDENTIFIED BY <password> / GRANT) and
    // resolve the real host. Until then host is a placeholder.
    const host = 'db.refx.internal';

    const row = await this.prisma.serverDatabase.create({
      data: {
        id: uuidv7(),
        serverId,
        engine: dto.engine,
        name: dto.name,
        username,
        passwordEnc: this.crypto.encrypt(password),
        host,
        port: ENGINE_PORTS[dto.engine] ?? 3306,
        remoteAccess: dto.remoteAccess ?? '%',
      },
    });

    // Plaintext password is returned exactly once, on create.
    return { ...this.strip(row), password };
  }

  async remove(serverId: string, dbId: string): Promise<void> {
    await this.assertServer(serverId);
    const db = await this.prisma.serverDatabase.findFirst({
      where: { id: dbId, serverId },
    });
    if (!db) throw new NotFoundException('Database not found');
    // TODO(impl): DROP DATABASE + DROP USER on the shared DB host.
    await this.prisma.serverDatabase.delete({ where: { id: dbId } });
  }

  async rotate(
    serverId: string,
    dbId: string,
  ): Promise<{ password: string }> {
    await this.assertServer(serverId);
    const db = await this.prisma.serverDatabase.findFirst({
      where: { id: dbId, serverId },
    });
    if (!db) throw new NotFoundException('Database not found');

    const password = this.crypto.token(18);
    // TODO(impl): ALTER USER ... IDENTIFIED BY <password> on the shared DB host.
    await this.prisma.serverDatabase.update({
      where: { id: dbId },
      data: { passwordEnc: this.crypto.encrypt(password) },
    });
    return { password };
  }
}
