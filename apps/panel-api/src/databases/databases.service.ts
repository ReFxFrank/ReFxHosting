import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ServerDatabase } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CryptoService } from "../common/crypto/crypto.service";
import { uuidv7 } from "../common/util/uuid";
import { CreateDatabaseDto } from "./dto/databases.dto";
import { DatabaseProvisioner, HostAdmin } from "./database-provisioner";
import { DatabaseHostsService } from "./database-hosts.service";

/** Public shape of a database (never exposes the stored password). */
export type SafeDatabase = Omit<ServerDatabase, "passwordEnc">;

/** Minimal shape of the joined DatabaseHost used to build an admin connection. */
interface HostAdminSource {
  host: string;
  port: number;
  username: string;
  passwordEnc: string;
}

@Injectable()
export class DatabasesService {
  private readonly logger = new Logger(DatabasesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly hosts: DatabaseHostsService,
    private readonly provisioner: DatabaseProvisioner,
  ) {}

  private strip(db: ServerDatabase): SafeDatabase {
    const { passwordEnc: _passwordEnc, ...rest } = db;
    return rest;
  }

  private adminOf(db: { dbHost: HostAdminSource | null }): HostAdmin | null {
    return db.dbHost
      ? {
          host: db.dbHost.host,
          port: db.dbHost.port,
          username: db.dbHost.username,
          passwordEnc: db.dbHost.passwordEnc,
        }
      : null;
  }

  private async assertServer(serverId: string): Promise<void> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      select: { id: true },
    });
    if (!server) throw new NotFoundException("Server not found");
  }

  async list(serverId: string): Promise<SafeDatabase[]> {
    await this.assertServer(serverId);
    const rows = await this.prisma.serverDatabase.findMany({
      where: { serverId },
      orderBy: { createdAt: "desc" },
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
    if (!server) throw new NotFoundException("Server not found");

    // Namespaced physical identifier (db name == user), e.g. s<shortId>_<name>.
    const ident = DatabaseProvisioner.ident(server.shortId, dto.name);
    const existing = await this.prisma.serverDatabase.findUnique({
      where: { serverId_name: { serverId, name: ident } },
    });
    if (existing) throw new ConflictException("Database name already in use");

    // Placement: throws a clear error if no host with capacity is configured.
    const host = await this.hosts.pickHostFor(dto.engine);
    const password = this.crypto.token(18);
    const remote = dto.remoteAccess ?? "%";

    // Provision on the host FIRST — only persist the row once the DB exists, so we
    // never show the customer credentials for a database that wasn't created.
    await this.provisioner.provision(
      {
        host: host.host,
        port: host.port,
        username: host.username,
        passwordEnc: host.passwordEnc,
      },
      ident,
      password,
      remote,
    );

    const row = await this.prisma.serverDatabase.create({
      data: {
        id: uuidv7(),
        serverId,
        hostId: host.id,
        engine: dto.engine,
        name: ident,
        username: ident,
        passwordEnc: this.crypto.encrypt(password),
        host: host.publicHost,
        port: host.port,
        remoteAccess: remote,
      },
    });

    // Plaintext password is returned exactly once, on create.
    return { ...this.strip(row), password };
  }

  async remove(serverId: string, dbId: string): Promise<void> {
    await this.assertServer(serverId);
    const db = await this.prisma.serverDatabase.findFirst({
      where: { id: dbId, serverId },
      include: { dbHost: true },
    });
    if (!db) throw new NotFoundException("Database not found");

    const admin = this.adminOf(db);
    if (admin) {
      // Best-effort teardown — don't block removing the record if the host is
      // briefly unreachable (a stray DB is far less bad than an un-deletable row).
      try {
        await this.provisioner.drop(admin, db.name, db.remoteAccess);
      } catch (e) {
        this.logger.warn(
          `DROP DDL failed for ${db.name} (removing record anyway): ${(e as Error).message}`,
        );
      }
    }
    await this.prisma.serverDatabase.delete({ where: { id: dbId } });
  }

  async rotate(serverId: string, dbId: string): Promise<{ password: string }> {
    await this.assertServer(serverId);
    const db = await this.prisma.serverDatabase.findFirst({
      where: { id: dbId, serverId },
      include: { dbHost: true },
    });
    if (!db) throw new NotFoundException("Database not found");

    const admin = this.adminOf(db);
    if (!admin) {
      throw new BadRequestException(
        "This database is not linked to a host and cannot be rotated.",
      );
    }

    const password = this.crypto.token(18);
    // Rotate on the host FIRST — if the DDL fails, throw and keep the stored
    // password consistent with the live database (don't record a mismatch).
    await this.provisioner.rotate(admin, db.name, db.remoteAccess, password);
    await this.prisma.serverDatabase.update({
      where: { id: dbId },
      data: { passwordEnc: this.crypto.encrypt(password) },
    });
    return { password };
  }
}
