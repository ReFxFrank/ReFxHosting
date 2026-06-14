// ============================================================================
// TCAdmin source — extracts from the TCAdmin 2 SQL database (read-only).
// ----------------------------------------------------------------------------
// TCAdmin 2 has no first-class public extraction API; the supported way to read
// its fleet is directly from its database (MSSQL by default, optionally MySQL).
// We read (never write).
//
// No SQL driver is a dependency of this repo, so this source uses a
// DRIVER-INJECTION design: the caller supplies a thin async `query(sql, params)`
// function that returns rows as plain objects. That keeps the migration package
// driver-agnostic and dependency-free.
//
//   // --- MSSQL (npm: mssql) ------------------------------------------------
//   import sql from 'mssql';
//   const pool = await sql.connect({
//     server: 'db-host', database: 'TCAdmin2', user: 'ro', password: '***',
//     options: { encrypt: true, trustServerCertificate: true },
//   });
//   const src = new TcAdminSource({
//     engine: 'mssql',
//     query: async (text, params = []) => {
//       const req = pool.request();
//       // bind positional params as @p0, @p1, ... (see paramName() below).
//       params.forEach((v, i) => req.input(`p${i}`, v));
//       const res = await req.query(text);
//       return res.recordset as any[];
//     },
//   });
//
//   // --- MySQL (npm: mysql2/promise) ---------------------------------------
//   import mysql from 'mysql2/promise';
//   const conn = await mysql.createConnection({ host, user, password, database });
//   const src = new TcAdminSource({
//     engine: 'mysql',
//     query: async (text, params = []) => {
//       const [rows] = await conn.execute(text, params);
//       return rows as any[];
//     },
//   });
//
// Mapping intent (docs/11-migration.md):
//   - tcadmin.users                          -> NormalizedUser (master admin -> OWNER)
//   - tcadmin.servers (+ datacenters)        -> NormalizedNode (+ allocations from ip pool)
//   - tcadmin.games                          -> NormalizedTemplate (NATIVE_PROCESS;
//                                               startup/config must be reviewed)
//   - tcadmin.game_servers (joined games)    -> NormalizedServer (slots/memory/ports/ip)
//
// TCAdmin is Windows-heavy, so templates are emitted as NATIVE_PROCESS with both
// OSes supported; the admin re-targets WINDOWS_CONTAINER per node as needed.
//
// NOTE on schema: TCAdmin's column names differ across versions and across the
// MSSQL/MySQL deployments. Each query uses the documented / most-common column
// names; spots that may need per-install adjustment are flagged // TODO(impl).
// ============================================================================

import type { DeployMethod, GlobalRole } from '@prisma/client';
import {
  NormalizedAllocation,
  NormalizedNode,
  NormalizedServer,
  NormalizedServerVariable,
  NormalizedSubUser,
  NormalizedTemplate,
  NormalizedTemplateVariable,
  NormalizedUser,
} from '../types';
import { MigrationSource } from './source.interface';

/** A thin, caller-injected, read-only query function. */
export type TcAdminQuery = (sql: string, params?: unknown[]) => Promise<unknown[]>;

export interface TcAdminSourceOptions {
  /** Which SQL dialect the injected `query` speaks — drives param placeholders. */
  engine: 'mssql' | 'mysql';
  /**
   * Read-only query function. The caller wires this to `mssql` / `mysql2` so the
   * migration package itself takes on no SQL driver dependency. REQUIRED.
   */
  query: TcAdminQuery;
}

// --- Row shapes (only the columns we read) ----------------------------------

interface TcUserRow {
  user_id: number | string;
  email?: string | null;
  user_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  // 1 / true when the account is a master admin.
  is_admin?: number | boolean | null;
}

interface TcServerRow {
  // A TCAdmin "server" row is a physical game-server box (a host/node).
  server_id: number | string;
  name?: string | null;
  ip?: string | null;
  fqdn?: string | null;
  operating_system?: string | number | null;
  datacenter_id?: number | string | null;
  datacenter_name?: string | null;
}

interface TcGameRow {
  game_id: number | string;
  name?: string | null;
  command_line?: string | null;
  executable?: string | null;
  steam_app_id?: number | string | null;
  operating_system?: string | number | null;
}

interface TcGameServerRow {
  // A user's provisioned game service.
  game_service_id: number | string;
  service_name?: string | null;
  game_id?: number | string | null;
  game_name?: string | null;
  user_id?: number | string | null;
  server_id?: number | string | null; // host box id -> nodeExternalId
  ip?: string | null;
  game_port?: number | string | null;
  slots?: number | string | null;
  memory?: number | string | null; // MB
  enabled?: number | boolean | null;
  suspended?: number | boolean | null;
  command_line?: string | null;
}

const SLUG_RE = /[^a-z0-9]+/g;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(SLUG_RE, '-')
    .replace(/^-+|-+$/g, '');
}

function toInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function truthy(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v === '1' || v.toLowerCase() === 'true';
  return false;
}

/** TCAdmin runs Windows boxes most often; map an OS hint to the Node OS enum. */
function osToNodeOs(os: unknown): 'LINUX' | 'WINDOWS' {
  if (os == null) return 'WINDOWS';
  const s = String(os).toLowerCase();
  if (s.includes('linux') || s.includes('unix') || s === '1') return 'LINUX';
  return 'WINDOWS';
}

export class TcAdminSource implements MigrationSource {
  readonly key = 'tcadmin';

  private readonly engine: 'mssql' | 'mysql';
  private readonly query: TcAdminQuery;

  // `opts` is optional only so the CLI's generic `new TcAdminSource()` dispatch
  // type-checks; a missing/invalid `query` is rejected immediately below.
  constructor(opts?: TcAdminSourceOptions) {
    if (!opts || typeof opts.query !== 'function') {
      throw new Error(
        'TcAdminSource requires an injected `query` function. Wire it to the ' +
          'mssql (recordset) or mysql2/promise driver — see the file header for ' +
          'an example. No SQL driver is bundled with the migration package.',
      );
    }
    this.engine = opts.engine ?? 'mssql';
    this.query = opts.query;
  }

  // --- SQL helpers -------------------------------------------------------

  /**
   * Positional placeholder for the active engine: `?` for MySQL, `@p<idx>` for
   * MSSQL (matching the `req.input('p<idx>', ...)` binding in the header example).
   */
  private param(index: number): string {
    return this.engine === 'mysql' ? '?' : `@p${index}`;
  }

  private async select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const rows = await this.query(sql, params);
    return (rows ?? []) as T[];
  }

  // --- Users -------------------------------------------------------------

  async fetchUsers(): Promise<NormalizedUser[]> {
    // TODO(impl): table/column names vary by TCAdmin version. The common 2.x
    // schema is `tcadmin.users` with `user_id`, `email`, `user_name`,
    // `first_name`, `last_name`, and an admin flag (`is_admin` / `master_admin`).
    const rows = await this.select<TcUserRow>(
      `SELECT user_id, email, user_name, first_name, last_name, is_admin
         FROM users`,
    );

    return rows
      .filter((r) => r.user_id != null)
      .map((r) => {
        const externalId = String(r.user_id);
        const username = r.user_name ?? externalId;
        // TCAdmin accounts may lack a stored email; synthesize a stable
        // placeholder so the User.email upsert key is satisfiable. Admin fixes up.
        const email =
          r.email && r.email.includes('@')
            ? r.email
            : `${slugify(username) || externalId}@tcadmin.imported.invalid`;
        const role: GlobalRole = truthy(r.is_admin) ? 'OWNER' : 'CUSTOMER';
        return {
          externalId,
          email,
          firstName: r.first_name ?? username,
          lastName: r.last_name ?? null,
          globalRole: role,
          locale: null,
          // Source password hashes are never migrated; force a reset.
          emailVerified: false,
        };
      });
  }

  // --- Nodes + allocations ----------------------------------------------

  async fetchNodes(): Promise<NormalizedNode[]> {
    // A TCAdmin "server" is a physical game-server host. Join the datacenter so
    // each node carries a region hint.
    // TODO(impl): in some installs hosts live in `tcadmin.servers` joined to
    // `tcadmin.datacenters` on `datacenter_id`; column names (`name`, `ip`,
    // `fqdn`, `operating_system`) may differ per version.
    const rows = await this.select<TcServerRow>(
      `SELECT s.server_id        AS server_id,
              s.name             AS name,
              s.ip               AS ip,
              s.fqdn             AS fqdn,
              s.operating_system AS operating_system,
              s.datacenter_id    AS datacenter_id,
              d.name             AS datacenter_name
         FROM servers s
         LEFT JOIN datacenters d ON d.datacenter_id = s.datacenter_id`,
    );

    // Pre-aggregate the in-use game ports per host so nodes carry allocations.
    const allocationsByNode = await this.allocationsByNode();

    return rows
      .filter((r) => r.server_id != null)
      .map((r) => {
        const externalId = String(r.server_id);
        const ip = r.ip ?? '0.0.0.0';
        const fqdn = r.fqdn || r.ip || r.name || `tcadmin-${externalId}`;
        return {
          externalId,
          name: r.name || fqdn,
          fqdn,
          regionExternalId:
            r.datacenter_id != null ? String(r.datacenter_id) : null,
          os: osToNodeOs(r.operating_system),
          // TCAdmin's agent is a Windows service; no Wings-style daemon port.
          daemonPort: null,
          sftpPort: null,
          scheme: 'https',
          // TODO(impl): TCAdmin does not advertise host CPU/RAM/disk capacity in
          // a portable column. Default to a minimum (importer warns when low) and
          // let the agent re-advertise real capacity after enrollment.
          cpuCores: 1,
          memoryMb: 1024,
          diskMb: 10240,
          cpuOvercommit: 1.0,
          memOvercommit: 1.0,
          allocations: allocationsByNode.get(externalId) ?? [
            // Ensure the host has at least its base IP as an allocation pool entry.
            {
              externalId: `${externalId}:0`,
              ip,
              port: 0,
              alias: null,
              isPrimary: false,
            },
          ],
        };
      });
  }

  /**
   * Build the per-host allocation map from the game services' bound IP:port.
   * TCAdmin has no node-level free-port pool table we can rely on across
   * versions, so allocations are derived from what services actually occupy.
   */
  private async allocationsByNode(): Promise<Map<string, NormalizedAllocation[]>> {
    const services = await this.select<TcGameServerRow>(
      `SELECT game_service_id, server_id, ip, game_port
         FROM game_servers`,
    );
    const byNode = new Map<string, NormalizedAllocation[]>();
    const seen = new Set<string>();
    for (const s of services) {
      if (s.server_id == null) continue;
      const node = String(s.server_id);
      const ip = (s.ip as string) || '0.0.0.0';
      const port = toInt(s.game_port, 0);
      if (port <= 0) continue;
      const dedupe = `${node}|${ip}:${port}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const list = byNode.get(node) ?? [];
      list.push({
        externalId: `${node}:${ip}:${port}`,
        ip,
        port,
        alias: null,
        // Per-server primacy is resolved on the server, not the node pool.
        isPrimary: false,
      });
      byNode.set(node, list);
    }
    return byNode;
  }

  // --- Templates (one per distinct game) ---------------------------------

  async fetchEggs(): Promise<NormalizedTemplate[]> {
    // TODO(impl): the games catalog is usually `tcadmin.games`; `command_line`,
    // `executable`, `steam_app_id` and `operating_system` names vary per version.
    const rows = await this.select<TcGameRow>(
      `SELECT game_id, name, command_line, executable, steam_app_id, operating_system
         FROM games`,
    );

    return rows
      .filter((r) => r.game_id != null)
      .map((r) => this.mapGame(r));
  }

  private mapGame(r: TcGameRow): NormalizedTemplate {
    const externalId = String(r.game_id);
    const name = r.name || `Game ${externalId}`;
    const steamAppId =
      r.steam_app_id != null && Number.isFinite(Number(r.steam_app_id))
        ? Number(r.steam_app_id)
        : null;
    // TCAdmin stores the launch command line and executable; we surface the most
    // useful of the two as the startup command. Replacement tokens (e.g. {SLOTS})
    // remain in the string for admin review — there is no portable per-game
    // variable-definition table we can enumerate across versions.
    // TODO(impl): TCAdmin "variable replacement" / configurable settings could be
    // mined into TemplateVariable[] + configFiles per install; left empty here and
    // flagged for admin review (the importer warns on bare templates).
    const startupCommand =
      [r.executable, r.command_line].filter(Boolean).join(' ').trim() || '';
    const variables: NormalizedTemplateVariable[] = [];

    return {
      externalId,
      categoryExternalId: null,
      categoryName: 'TCAdmin Games',
      name,
      slug: `tcadmin-${slugify(name) || externalId}`,
      author: 'imported:tcadmin',
      description:
        'Synthesized from a TCAdmin game definition. Review the startup command, ' +
        'variables and config render specs before activating servers.',
      // TCAdmin runs native processes (Windows-heavy); admin can re-target a
      // node to WINDOWS_CONTAINER as needed.
      deployMethods: ['NATIVE_PROCESS'] as DeployMethod[],
      supportsLinux: true,
      supportsWindows: true,
      dockerImages: {},
      steamAppId,
      startupCommand,
      startupDetect: null,
      stopCommand: '^C',
      installScript: [],
      configFiles: [],
      recCpuCores: 1,
      recMemoryMb: 1024,
      recDiskMb: 5120,
      variables,
    };
  }

  // --- Servers -----------------------------------------------------------

  async fetchServers(): Promise<NormalizedServer[]> {
    // TODO(impl): the per-user game services live in `tcadmin.game_servers`;
    // join `tcadmin.games` for the game name. Column names (`game_service_id`,
    // `service_name`, `user_id`, `server_id`, `ip`, `game_port`, `slots`,
    // `memory`, `enabled`, `suspended`) vary per version.
    const rows = await this.select<TcGameServerRow>(
      `SELECT gs.game_service_id AS game_service_id,
              gs.service_name    AS service_name,
              gs.game_id         AS game_id,
              g.name             AS game_name,
              gs.user_id         AS user_id,
              gs.server_id       AS server_id,
              gs.ip              AS ip,
              gs.game_port       AS game_port,
              gs.slots           AS slots,
              gs.memory          AS memory,
              gs.enabled         AS enabled,
              gs.suspended       AS suspended,
              gs.command_line    AS command_line
         FROM game_servers gs
         LEFT JOIN games g ON g.game_id = gs.game_id`,
    );

    return rows
      .filter((r) => r.game_service_id != null)
      .map((r) => this.mapServer(r));
  }

  private mapServer(r: TcGameServerRow): NormalizedServer {
    const externalId = String(r.game_service_id);
    const ip = r.ip || '0.0.0.0';
    const port = toInt(r.game_port, 0);
    const nodeExternalId = r.server_id != null ? String(r.server_id) : '';
    const ownerExternalId = r.user_id != null ? String(r.user_id) : '';
    const templateExternalId = r.game_id != null ? String(r.game_id) : null;

    // A service binds one IP:port; reference the matching node allocation by id
    // (the node's allocation pool is built from these same IP:port pairs).
    const allocationExternalIds: string[] = [];
    let primaryAllocationExternalId: string | null = null;
    if (port > 0 && nodeExternalId) {
      const allocId = `${nodeExternalId}:${ip}:${port}`;
      allocationExternalIds.push(allocId);
      primaryAllocationExternalId = allocId;
    }

    const memoryMb = toInt(r.memory, 0) > 0 ? toInt(r.memory) : 1024;
    // TCAdmin has no per-service CPU/disk ceiling we can portably read; default
    // to a minimum (importer warns) and let the agent reconcile real usage.
    const cpuCores = 1;
    const diskMb = 5120;

    const variables: NormalizedServerVariable[] = [];
    const subUsers: NormalizedSubUser[] = [];

    return {
      externalId,
      name: r.service_name || r.game_name || `service-${externalId}`,
      description: null,
      ownerExternalId,
      nodeExternalId,
      templateExternalId,
      deployMethod: 'NATIVE_PROCESS',
      // A disabled or explicitly-suspended service maps to suspended.
      suspended: truthy(r.suspended) || (r.enabled != null && !truthy(r.enabled)),
      cpuCores,
      memoryMb,
      swapMb: 0,
      diskMb,
      ioWeight: 500,
      slots: toInt(r.slots, 0) > 0 ? toInt(r.slots) : null,
      // The launch command line is the closest to a startup override; admin
      // reconciles replacement tokens against the synthesized template.
      startupCommand: r.command_line ?? null,
      environment: {},
      dockerImage: null,
      allocationExternalIds,
      primaryAllocationExternalId,
      variables,
      subUsers,
    };
  }
}
