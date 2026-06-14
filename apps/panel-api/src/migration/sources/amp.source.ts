// ============================================================================
// AMP source — STUB.
// ----------------------------------------------------------------------------
// Data source: CubeCoders AMP. AMP is driven by the ADS (Application Deployment
// Service) instance manager + a per-instance JSON-RPC-ish HTTP API
// (`/API/<Module>/<Method>`, session-token auth). Migration would:
//   - enumerate instances via ADS (ADSModule.GetInstances)
//   - read each instance's module (Minecraft/Generic/...) -> GameTemplate
//     (Generic SteamCMD AppId -> steamAppId + deployMethods=[NATIVE_PROCESS])
//   - read settings/config nodes -> TemplateVariable[] + configFiles
//   - map instance owners/AMP users -> NormalizedUser (super-admin -> OWNER)
//   - map running instances -> NormalizedServer (Windows/Linux aware)
//
// AMP commonly runs native processes (not containers), so templates will favor
// NATIVE_PROCESS / WINDOWS_CONTAINER (see docs/11-migration.md).
// ============================================================================

import {
  NormalizedNode,
  NormalizedServer,
  NormalizedTemplate,
  NormalizedUser,
} from '../types';
import { MigrationSource, NotImplementedError } from './source.interface';

export interface AmpSourceOptions {
  /** ADS controller URL, e.g. https://amp.example.com:8080 */
  url?: string;
  username?: string;
  password?: string;
}

export class AmpSource implements MigrationSource {
  readonly key = 'amp';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(private readonly _opts: AmpSourceOptions = {}) {}

  async fetchUsers(): Promise<NormalizedUser[]> {
    // TODO(impl): ADS Core.GetAMPUsersSummary -> NormalizedUser[].
    throw new NotImplementedError(this.key, 'fetchUsers');
  }

  async fetchNodes(): Promise<NormalizedNode[]> {
    // TODO(impl): ADSModule.GetInstances -> NormalizedNode[] (+allocations).
    throw new NotImplementedError(this.key, 'fetchNodes');
  }

  async fetchServers(): Promise<NormalizedServer[]> {
    // TODO(impl): per-instance state/limits -> NormalizedServer[].
    throw new NotImplementedError(this.key, 'fetchServers');
  }

  async fetchEggs(): Promise<NormalizedTemplate[]> {
    // TODO(impl): module + settings nodes -> NormalizedTemplate[] (+variables).
    throw new NotImplementedError(this.key, 'fetchEggs');
  }
}
