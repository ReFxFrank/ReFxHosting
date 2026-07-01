import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { createConnection } from "mysql2/promise";
import { CryptoService } from "../common/crypto/crypto.service";

/** The admin connection to a shared DB host (decrypted at call time). */
export interface HostAdmin {
  host: string;
  port: number;
  username: string;
  passwordEnc: string;
}

const IDENT = /^[a-zA-Z0-9_]+$/;

/**
 * Runs the actual CREATE/DROP/GRANT DDL against a shared MySQL/MariaDB host over
 * the admin connection. Identifiers (db + user) can't be parameterized in DDL, so
 * they are strictly validated ([a-z0-9_], ≤64) — every value that CAN be a string
 * literal (password, host pattern) is escaped via the driver.
 */
@Injectable()
export class DatabaseProvisioner {
  private readonly logger = new Logger(DatabaseProvisioner.name);

  constructor(private readonly crypto: CryptoService) {}

  /** Namespaced, safe db/user identifier from a server shortId + chosen name. */
  static ident(shortId: string, name: string): string {
    const raw = `s${shortId}_${name}`.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    // Ensure it starts with a letter and fits MySQL's 64-char identifier limit
    // (user names are capped at 32 on older MySQL — stay ≤32 to be safe).
    const ident = (/^[a-z]/.test(raw) ? raw : `s_${raw}`).slice(0, 32);
    DatabaseProvisioner.assertIdent(ident);
    return ident;
  }

  static assertIdent(name: string): void {
    if (!IDENT.test(name) || name.length === 0 || name.length > 64) {
      throw new BadRequestException(`Invalid database identifier: ${name}`);
    }
  }

  private async connect(admin: HostAdmin) {
    return createConnection({
      host: admin.host,
      port: admin.port,
      user: admin.username,
      password: this.crypto.decrypt(admin.passwordEnc),
      multipleStatements: false,
      connectTimeout: 10_000,
    });
  }

  /** CREATE DATABASE + CREATE/ALTER USER + GRANT. Idempotent (IF NOT EXISTS). */
  async provision(
    admin: HostAdmin,
    ident: string,
    password: string,
    remote: string,
  ): Promise<void> {
    DatabaseProvisioner.assertIdent(ident);
    const conn = await this.connect(admin);
    try {
      const pw = conn.escape(password);
      const host = conn.escape(remote);
      await conn.query(
        `CREATE DATABASE IF NOT EXISTS \`${ident}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
      await conn.query(
        `CREATE USER IF NOT EXISTS \`${ident}\`@${host} IDENTIFIED BY ${pw}`,
      );
      // Ensure the password is set even if the user already existed.
      await conn.query(`ALTER USER \`${ident}\`@${host} IDENTIFIED BY ${pw}`);
      await conn.query(
        `GRANT ALL PRIVILEGES ON \`${ident}\`.* TO \`${ident}\`@${host}`,
      );
      await conn.query("FLUSH PRIVILEGES");
    } finally {
      await conn.end();
    }
  }

  /** DROP DATABASE + DROP USER (best-effort, idempotent). */
  async drop(admin: HostAdmin, ident: string, remote: string): Promise<void> {
    DatabaseProvisioner.assertIdent(ident);
    const conn = await this.connect(admin);
    try {
      const host = conn.escape(remote);
      await conn.query(`DROP DATABASE IF EXISTS \`${ident}\``);
      await conn.query(`DROP USER IF EXISTS \`${ident}\`@${host}`);
      await conn.query("FLUSH PRIVILEGES");
    } finally {
      await conn.end();
    }
  }

  /** ALTER USER ... IDENTIFIED BY (password rotation). */
  async rotate(
    admin: HostAdmin,
    ident: string,
    remote: string,
    password: string,
  ): Promise<void> {
    DatabaseProvisioner.assertIdent(ident);
    const conn = await this.connect(admin);
    try {
      const pw = conn.escape(password);
      const host = conn.escape(remote);
      await conn.query(`ALTER USER \`${ident}\`@${host} IDENTIFIED BY ${pw}`);
      await conn.query("FLUSH PRIVILEGES");
    } finally {
      await conn.end();
    }
  }

  /** Verify the admin connection works (used by the admin "test" action). */
  async testConnection(admin: HostAdmin): Promise<void> {
    const conn = await this.connect(admin);
    try {
      await conn.query("SELECT 1");
    } finally {
      await conn.end();
    }
  }
}
