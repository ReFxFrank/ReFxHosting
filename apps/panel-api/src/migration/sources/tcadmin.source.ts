// ============================================================================
// TCAdmin source — STUB.
// ----------------------------------------------------------------------------
// Data source: TCAdmin 2. There is no first-class public API; migration reads
// directly (READ-ONLY) from TCAdmin's database — MSSQL (SQL Server) by default,
// optionally MySQL. Relevant tables (names vary by version):
//   - tbl_users / tcadmin user accounts        -> NormalizedUser (master admin -> OWNER)
//   - tbl_servers / game server boxes          -> NormalizedNode (+allocations)
//   - tbl_games / tbl_game_mods                -> NormalizedTemplate (+GameCategory)
//   - command line / executable, SteamCMD app  -> startupCommand / steamAppId / installScript
//   - variable replacement / configurable opts -> TemplateVariable[] + configFiles
//   - user game services                       -> NormalizedServer (+variables, +subusers)
//
// TCAdmin is Windows-heavy, so templates map to WINDOWS_CONTAINER / NATIVE_PROCESS
// to match the target Node.os (see docs/11-migration.md).
// ============================================================================

import {
  NormalizedNode,
  NormalizedServer,
  NormalizedTemplate,
  NormalizedUser,
} from '../types';
import { MigrationSource, NotImplementedError } from './source.interface';

export interface TcAdminSourceOptions {
  /** Read-only DB connection string (MSSQL or MySQL). */
  dsn?: string;
  driver?: 'mssql' | 'mysql';
}

export class TcAdminSource implements MigrationSource {
  readonly key = 'tcadmin';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(private readonly _opts: TcAdminSourceOptions = {}) {}

  async fetchUsers(): Promise<NormalizedUser[]> {
    // TODO(impl): SELECT from tcadmin users table -> NormalizedUser[].
    throw new NotImplementedError(this.key, 'fetchUsers');
  }

  async fetchNodes(): Promise<NormalizedNode[]> {
    // TODO(impl): SELECT game server boxes + IP/port pools -> NormalizedNode[].
    throw new NotImplementedError(this.key, 'fetchNodes');
  }

  async fetchServers(): Promise<NormalizedServer[]> {
    // TODO(impl): SELECT user game services -> NormalizedServer[].
    throw new NotImplementedError(this.key, 'fetchServers');
  }

  async fetchEggs(): Promise<NormalizedTemplate[]> {
    // TODO(impl): SELECT games/mods + variable replacement -> NormalizedTemplate[].
    throw new NotImplementedError(this.key, 'fetchEggs');
  }
}
