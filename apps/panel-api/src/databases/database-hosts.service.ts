import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { DatabaseHost, DbEngine } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CryptoService } from "../common/crypto/crypto.service";
import { uuidv7 } from "../common/util/uuid";
import { DatabaseProvisioner } from "./database-provisioner";
import {
  CreateDatabaseHostDto,
  UpdateDatabaseHostDto,
} from "./dto/databases.dto";

/** Host without the encrypted admin password (safe to return to the admin UI). */
export type SafeHost = Omit<DatabaseHost, "passwordEnc"> & {
  databaseCount?: number;
};

@Injectable()
export class DatabaseHostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly provisioner: DatabaseProvisioner,
  ) {}

  private strip(h: DatabaseHost, count?: number): SafeHost {
    const { passwordEnc: _pw, ...rest } = h;
    return count === undefined ? rest : { ...rest, databaseCount: count };
  }

  async list(): Promise<SafeHost[]> {
    const hosts = await this.prisma.databaseHost.findMany({
      include: { _count: { select: { databases: true } } },
      orderBy: { createdAt: "asc" },
    });
    return hosts.map((h) => this.strip(h, h._count.databases));
  }

  async create(dto: CreateDatabaseHostDto): Promise<SafeHost> {
    const host = await this.prisma.databaseHost.create({
      data: {
        id: uuidv7(),
        name: dto.name,
        engine: dto.engine ?? "MARIADB",
        host: dto.host,
        port: dto.port ?? 3306,
        username: dto.username,
        passwordEnc: this.crypto.encrypt(dto.password),
        publicHost: dto.publicHost,
        maxDatabases: dto.maxDatabases ?? 500,
        isActive: dto.isActive ?? true,
      },
    });
    return this.strip(host);
  }

  async update(id: string, dto: UpdateDatabaseHostDto): Promise<SafeHost> {
    await this.get(id);
    const host = await this.prisma.databaseHost.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.host !== undefined ? { host: dto.host } : {}),
        ...(dto.port !== undefined ? { port: dto.port } : {}),
        ...(dto.username !== undefined ? { username: dto.username } : {}),
        ...(dto.password
          ? { passwordEnc: this.crypto.encrypt(dto.password) }
          : {}),
        ...(dto.publicHost !== undefined ? { publicHost: dto.publicHost } : {}),
        ...(dto.maxDatabases !== undefined
          ? { maxDatabases: dto.maxDatabases }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    return this.strip(host);
  }

  async remove(id: string): Promise<void> {
    const count = await this.prisma.serverDatabase.count({
      where: { hostId: id },
    });
    if (count > 0) {
      throw new BadRequestException(
        `Host has ${count} database(s) — delete/move them before removing the host`,
      );
    }
    await this.prisma.databaseHost.delete({ where: { id } });
  }

  /** Verify the admin connection to a host works. */
  async test(id: string): Promise<{ ok: true }> {
    const host = await this.getRaw(id);
    await this.provisioner.testConnection(host);
    return { ok: true };
  }

  private async getRaw(id: string): Promise<DatabaseHost> {
    const host = await this.prisma.databaseHost.findUnique({ where: { id } });
    if (!host) throw new NotFoundException("Database host not found");
    return host;
  }

  async get(id: string): Promise<SafeHost> {
    return this.strip(await this.getRaw(id));
  }

  /**
   * Choose an active host for a requested engine with spare capacity. Only
   * MySQL/MariaDB are provisionable today; Postgres hosts would need a separate
   * provisioner. Throws a clear, customer-facing error when none is available so
   * the UI shows a real message instead of a fake success.
   */
  async pickHostFor(engine: DbEngine): Promise<DatabaseHost> {
    if (engine !== "MYSQL" && engine !== "MARIADB") {
      throw new BadRequestException(
        "Only MySQL / MariaDB databases can be provisioned right now.",
      );
    }
    const hosts = await this.prisma.databaseHost.findMany({
      where: { isActive: true, engine: { in: ["MYSQL", "MARIADB"] } },
      include: { _count: { select: { databases: true } } },
      orderBy: { createdAt: "asc" },
    });
    const withRoom = hosts.find((h) => h._count.databases < h.maxDatabases);
    if (!withRoom) {
      throw new ServiceUnavailableException(
        "Database hosting is not available yet — no database host with capacity is configured.",
      );
    }
    return withRoom;
  }
}
