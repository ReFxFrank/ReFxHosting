// ============================================================================
// AMP source — extracts from CubeCoders AMP via the ADS controller HTTP API.
// ----------------------------------------------------------------------------
// AMP is driven by the ADS (Application Deployment Service) instance manager and
// a JSON-RPC-ish HTTP API. Every endpoint is a POST to
//   <url>/API/<Module>/<Method>
// with a JSON body. Authentication is session-based:
//
//   POST /API/Core/Login   { username, password, token, rememberMe }
//     -> { success, sessionID, ... }
//
// The returned `sessionID` is then included in the body of subsequent calls
// (AMP threads it as the `SESSIONID` parameter). Errors surface either as a
// non-200 status or a JSON body with `{ result: false }` / `{ success: false }`.
//
// We read (never write):
//   ADSModule/GetInstances      -> controllers + their target instances
//   Core/GetAMPUsersSummary     -> AMP user accounts
//   Core/GetAllAMPUserInfo      -> per-user role / permission detail
//
// Mapping intent (docs/11-migration.md):
//   - ADS controllers/targets        -> NormalizedNode (+ allocations from
//                                       each instance's ApplicationEndpoints)
//   - AMP instance Module/ApplicationName -> NormalizedTemplate (one per
//                                       distinct module; NATIVE_PROCESS — AMP
//                                       runs native processes, not containers)
//   - AMP instance                   -> NormalizedServer (RunningState -> state,
//                                       Metrics/limits -> resources, endpoints
//                                       -> allocations)
//   - AMP users (super-admin)        -> NormalizedUser (OWNER)
//
// AMP has no "egg" export, so templates are synthesized per distinct module and
// the startup command / config must be reviewed post-import (see TODO(impl)).
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

// --- AMP API shapes (only the fields we read) -------------------------------

interface AmpLoginResult {
  success: boolean;
  // AMP returns an empty sessionID + a result code when credentials are wrong.
  sessionID?: string;
  rememberMeToken?: string;
  result?: number;
  resultReason?: string;
}

/** One ApplicationEndpoint entry, e.g. { DisplayName, Endpoint, Uri }. */
interface AmpEndpoint {
  DisplayName?: string;
  Endpoint?: string; // "0.0.0.0:25565" or "1.2.3.4:25565"
  Uri?: string;
  Protocol?: string;
}

interface AmpInstance {
  InstanceID: string;
  InstanceName: string;
  FriendlyName?: string;
  Module?: string; // "Minecraft", "GenericModule", "ADS", ...
  ModuleDisplayName?: string;
  AppState?: number | string; // RunningState (numeric enum or string)
  Running?: boolean;
  Suspended?: boolean;
  IP?: string;
  Port?: number;
  // Application endpoints exposed by the instance (game/query/rcon ports).
  ApplicationEndpoints?: AmpEndpoint[];
  // Optional resource hints. Field names vary across AMP builds.
  Metrics?: Record<string, { RawValue?: number; MaxValue?: number; Units?: string }>;
  // Some builds expose explicit limits.
  MaxMemoryMB?: number;
  CPULimit?: number;
  DiskUsageMB?: number;
}

/** A controller/target group returned by ADSModule/GetInstances. */
interface AmpTargetGroup {
  Id?: string;
  InstanceId?: string; // controller instance id
  FriendlyName?: string;
  Hostname?: string;
  Description?: string;
  Platform?: string | number; // platform hint (Windows/Linux)
  AvailableInstances?: AmpInstance[];
  // Some builds key the platform/OS under Tags or State.
  State?: number | string;
}

interface AmpUserSummary {
  // GetAMPUsersSummary returns id->name in some builds, an array in others.
  ID?: string;
  Name?: string;
  Username?: string;
  EmailAddress?: string;
  IsSuperUser?: boolean;
  Disabled?: boolean;
}

interface AmpUserInfo {
  ID?: string;
  Name?: string;
  Username?: string;
  EmailAddress?: string;
  IsSuperUser?: boolean;
  Disabled?: boolean;
  // Roles is typically a map id->name or array of role names.
  Roles?: Record<string, string> | string[];
}

export interface AmpSourceOptions {
  /** ADS controller URL, e.g. https://amp.example.com:8080 (no trailing /). */
  url: string;
  username?: string;
  password?: string;
  /** Two-factor token, when the account requires it. */
  twoFactorToken?: string;
  /**
   * Pre-issued session id / API token. When supplied we skip Core/Login. AMP
   * threads this as the SESSIONID body parameter on every call.
   */
  token?: string;
  /** Override the fetch implementation (tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

const SLUG_RE = /[^a-z0-9]+/g;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(SLUG_RE, '-')
    .replace(/^-+|-+$/g, '');
}

/** Split "ip:port" (or "[v6]:port") into parts; tolerate a bare port. */
function splitEndpoint(ep: string): { ip: string; port: number } | null {
  const trimmed = ep.trim();
  if (!trimmed) return null;
  const lastColon = trimmed.lastIndexOf(':');
  if (lastColon < 0) {
    const port = Number(trimmed);
    return Number.isFinite(port) && port > 0 ? { ip: '0.0.0.0', port } : null;
  }
  const ip = trimmed.slice(0, lastColon).replace(/^\[|\]$/g, '') || '0.0.0.0';
  const port = Number(trimmed.slice(lastColon + 1));
  if (!Number.isFinite(port) || port <= 0) return null;
  return { ip, port };
}

export class AmpSource implements MigrationSource {
  readonly key = 'amp';

  private readonly base: string;
  private readonly opts: AmpSourceOptions;
  private readonly fetchImpl: typeof fetch;
  private sessionId: string | null = null;

  // `opts` is optional only so the CLI's generic `new AmpSource()` dispatch
  // type-checks; a missing url is rejected immediately below.
  constructor(opts?: AmpSourceOptions) {
    if (!opts || !opts.url) {
      throw new Error('AmpSource requires a url (ADS controller URL).');
    }
    this.base = opts.url.replace(/\/+$/, '');
    this.opts = opts;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sessionId = opts.token ?? null;
  }

  // --- HTTP / auth -------------------------------------------------------

  /** POST <base>/API/<module>/<method> with the session threaded in the body. */
  private async call<T>(
    moduleMethod: string,
    body: Record<string, unknown> = {},
  ): Promise<T> {
    const sessionId = await this.ensureSession();
    const res = await this.fetchImpl(`${this.base}/API/${moduleMethod}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ SESSIONID: sessionId, ...body }),
    });
    if (!res.ok) {
      throw new Error(
        `AMP POST ${moduleMethod} failed: ${res.status} ${res.statusText}`,
      );
    }
    const json = (await res.json()) as T & {
      result?: unknown;
      success?: unknown;
    };
    // AMP signals logical failure with result:false / success:false even on 200.
    if (json && (json.result === false || json.success === false)) {
      throw new Error(`AMP ${moduleMethod} returned an API error (result:false)`);
    }
    return json as T;
  }

  /** Authenticate once and cache the sessionID. */
  private async ensureSession(): Promise<string> {
    if (this.sessionId) return this.sessionId;
    const res = await this.fetchImpl(`${this.base}/API/Core/Login`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: this.opts.username ?? '',
        password: this.opts.password ?? '',
        token: this.opts.twoFactorToken ?? '',
        rememberMe: false,
      }),
    });
    if (!res.ok) {
      throw new Error(
        `AMP Core/Login failed: ${res.status} ${res.statusText}`,
      );
    }
    const login = (await res.json()) as AmpLoginResult;
    if (!login.success || !login.sessionID) {
      throw new Error(
        `AMP Core/Login rejected: ${login.resultReason ?? 'invalid credentials'}`,
      );
    }
    this.sessionId = login.sessionID;
    return this.sessionId;
  }

  /** ADSModule/GetInstances -> flat list of controller groups. */
  private async getInstanceGroups(): Promise<AmpTargetGroup[]> {
    // GetInstances returns an array of target/controller groups, each holding
    // AvailableInstances. Some builds return GetLocalInstances (array of
    // instances) on a standalone controller instead.
    const groups = await this.call<AmpTargetGroup[] | { result?: AmpTargetGroup[] }>(
      'ADSModule/GetInstances',
    );
    if (Array.isArray(groups)) return groups;
    // TODO(impl): a few AMP builds wrap the array under `result`; unwrap it.
    if (groups && Array.isArray(groups.result)) return groups.result;
    return [];
  }

  // --- Users -------------------------------------------------------------

  async fetchUsers(): Promise<NormalizedUser[]> {
    // Core/GetAllAMPUserInfo is the richest source (roles + super-user flag).
    // Older builds only expose Core/GetAMPUsersSummary; we try the rich call and
    // fall back to the summary list.
    let infos: AmpUserInfo[] = [];
    try {
      const raw = await this.call<
        AmpUserInfo[] | Record<string, AmpUserInfo> | { result?: AmpUserInfo[] }
      >('Core/GetAllAMPUserInfo');
      infos = this.coerceUserList(raw);
    } catch {
      const summary = await this.call<
        AmpUserSummary[] | Record<string, AmpUserSummary>
      >('Core/GetAMPUsersSummary');
      infos = this.coerceUserList(summary as AmpUserInfo[] | Record<string, AmpUserInfo>);
    }

    return infos
      .filter((u) => (u.ID ?? u.Username ?? u.Name) != null)
      .map((u) => {
        const externalId = String(u.ID ?? u.Username ?? u.Name);
        const username = u.Username ?? u.Name ?? externalId;
        // AMP accounts are not guaranteed to carry an email; synthesize a stable
        // placeholder so the User.email upsert key is satisfiable. Admin fixes up.
        // TODO(impl): GetAllAMPUserInfo email field name varies; prefer real one.
        const email =
          u.EmailAddress && u.EmailAddress.includes('@')
            ? u.EmailAddress
            : `${slugify(username) || externalId}@amp.imported.invalid`;
        const role: GlobalRole = u.IsSuperUser ? 'OWNER' : 'CUSTOMER';
        return {
          externalId,
          email,
          firstName: username,
          lastName: null,
          globalRole: role,
          locale: null,
          emailVerified: false,
        };
      });
  }

  /** Normalize the several shapes AMP returns user collections in. */
  private coerceUserList(
    raw: AmpUserInfo[] | Record<string, AmpUserInfo> | { result?: AmpUserInfo[] },
  ): AmpUserInfo[] {
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray((raw as { result?: AmpUserInfo[] }).result)) {
      return (raw as { result: AmpUserInfo[] }).result;
    }
    if (raw && typeof raw === 'object') {
      // Map of id -> info (or id -> name). Materialize the id into the entry.
      return Object.entries(raw as Record<string, AmpUserInfo | string>).map(
        ([id, v]) =>
          typeof v === 'string'
            ? ({ ID: id, Username: v } as AmpUserInfo)
            : ({ ID: v.ID ?? id, ...v } as AmpUserInfo),
      );
    }
    return [];
  }

  // --- Nodes + allocations ----------------------------------------------

  async fetchNodes(): Promise<NormalizedNode[]> {
    const groups = await this.getInstanceGroups();
    const nodes: NormalizedNode[] = [];
    for (const g of groups) {
      const externalId = String(g.InstanceId ?? g.Id ?? g.FriendlyName ?? '');
      if (!externalId) continue;
      const fqdn =
        g.Hostname ||
        g.FriendlyName ||
        `amp-${externalId}`;
      const os = this.platformToOs(g.Platform);

      // Allocations are the union of every instance's ApplicationEndpoints on
      // this controller. AMP has no node-level allocation pool, so we derive it.
      const allocations: NormalizedAllocation[] = [];
      const seen = new Set<string>();
      for (const inst of g.AvailableInstances ?? []) {
        for (const a of this.instanceAllocations(inst)) {
          const dedupe = `${a.ip}:${a.port}`;
          if (seen.has(dedupe)) continue;
          seen.add(dedupe);
          allocations.push(a);
        }
      }

      nodes.push({
        externalId,
        name: g.FriendlyName || fqdn,
        fqdn,
        // AMP exposes no Region/Datacenter concept; importer uses a default region.
        regionExternalId: null,
        os,
        daemonPort: null,
        sftpPort: null,
        scheme: 'https',
        // AMP controllers don't advertise host core/RAM/disk capacity over this
        // API; default to a minimum and let the agent re-advertise. The importer
        // records a warning when cpuCores <= 1.
        // TODO(impl): GetInstances has no host capacity; backfill from the OS or
        // from Core/GetSystemInfo per controller if richer data is needed.
        cpuCores: 1,
        memoryMb: 1024,
        diskMb: 10240,
        cpuOvercommit: 1.0,
        memOvercommit: 1.0,
        allocations,
      });
    }
    return nodes;
  }

  /** Map an AMP Platform hint to the ReFx Node OS enum. */
  private platformToOs(platform: string | number | undefined): 'LINUX' | 'WINDOWS' {
    if (platform == null) return 'LINUX';
    const p = String(platform).toLowerCase();
    if (p.includes('win') || p === '0') return 'WINDOWS';
    return 'LINUX';
  }

  /** Build deterministic allocations from an instance's endpoints. */
  private instanceAllocations(inst: AmpInstance): NormalizedAllocation[] {
    const out: NormalizedAllocation[] = [];
    const endpoints = inst.ApplicationEndpoints ?? [];
    let idx = 0;
    for (const ep of endpoints) {
      const raw = ep.Endpoint ?? ep.Uri ?? '';
      const parsed = splitEndpoint(raw);
      if (!parsed) continue;
      const ip = parsed.ip !== '0.0.0.0' ? parsed.ip : inst.IP || parsed.ip;
      out.push({
        externalId: `${inst.InstanceID}:${parsed.port}`,
        ip,
        port: parsed.port,
        alias: ep.DisplayName ?? null,
        isPrimary: idx === 0,
      });
      idx += 1;
    }
    // Fall back to the instance's own IP:Port when no endpoints are exposed.
    if (out.length === 0 && inst.Port) {
      out.push({
        externalId: `${inst.InstanceID}:${inst.Port}`,
        ip: inst.IP || '0.0.0.0',
        port: inst.Port,
        alias: null,
        isPrimary: true,
      });
    }
    return out;
  }

  // --- Templates (synthesized per distinct module) -----------------------

  async fetchEggs(): Promise<NormalizedTemplate[]> {
    const groups = await this.getInstanceGroups();
    const byModule = new Map<string, { module: string; display: string }>();
    for (const g of groups) {
      for (const inst of g.AvailableInstances ?? []) {
        const module = inst.Module || 'GenericModule';
        // Skip the ADS controller pseudo-module — it is not a game template.
        if (module === 'ADS') continue;
        if (!byModule.has(module)) {
          byModule.set(module, {
            module,
            display: inst.ModuleDisplayName || module,
          });
        }
      }
    }

    const templates: NormalizedTemplate[] = [];
    for (const { module, display } of byModule.values()) {
      templates.push(this.synthesizeTemplate(module, display));
    }
    return templates;
  }

  /**
   * AMP has no egg/config export over this API, so we synthesize a minimal
   * template per distinct module. Startup command and variables are left empty
   * for admin review (recorded as warnings by the importer when fields are bare).
   */
  private synthesizeTemplate(module: string, display: string): NormalizedTemplate {
    // No reliable per-template variables over the public API.
    // TODO(impl): AMP setting/config nodes (Core/GetConfig / GetSettingsSpec)
    // could be enumerated to build TemplateVariable[] + configFiles; left empty
    // here and flagged for admin review.
    const variables: NormalizedTemplateVariable[] = [];
    return {
      externalId: module,
      categoryExternalId: null,
      categoryName: 'AMP Modules',
      name: display,
      slug: `amp-${slugify(display) || slugify(module) || 'module'}`,
      author: 'imported:amp',
      description:
        'Synthesized from an AMP module. Review startup command, variables and ' +
        'config before activating servers.',
      // AMP runs native processes, not containers.
      deployMethods: ['NATIVE_PROCESS'] as DeployMethod[],
      supportsLinux: true,
      supportsWindows: true,
      dockerImages: {},
      steamAppId: null,
      // No reliable startup command export; admin must fill it in.
      startupCommand: '',
      startupDetect: null,
      stopCommand: '^C',
      // No install script over the API — importer records a warning for empty.
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
    const groups = await this.getInstanceGroups();
    const servers: NormalizedServer[] = [];
    for (const g of groups) {
      const nodeExternalId = String(g.InstanceId ?? g.Id ?? g.FriendlyName ?? '');
      if (!nodeExternalId) continue;
      for (const inst of g.AvailableInstances ?? []) {
        if ((inst.Module || '') === 'ADS') continue; // skip controller itself
        servers.push(this.mapServer(inst, nodeExternalId));
      }
    }
    return servers;
  }

  private mapServer(inst: AmpInstance, nodeExternalId: string): NormalizedServer {
    const module = inst.Module || 'GenericModule';
    const allocations = this.instanceAllocations(inst);
    const allocationExternalIds = allocations.map((a) => a.externalId);
    const primary = allocations.find((a) => a.isPrimary) ?? allocations[0];

    const { memoryMb, cpuCores, diskMb } = this.instanceResources(inst);

    // AMP instances are owned by the AMP install; there is no per-instance owner
    // user over this API. Tie ownership to the super-admin sentinel so the
    // importer resolves an owner. TODO(impl): map real instance owners if a
    // build exposes them (e.g. via instance metadata / user assignments).
    const ownerExternalId = '__amp_owner__';

    const variables: NormalizedServerVariable[] = [];
    const subUsers: NormalizedSubUser[] = [];

    return {
      externalId: inst.InstanceID,
      name: inst.FriendlyName || inst.InstanceName,
      description: null,
      ownerExternalId,
      nodeExternalId,
      // Templates are keyed by module name (see synthesizeTemplate).
      templateExternalId: module === 'ADS' ? null : module,
      deployMethod: 'NATIVE_PROCESS',
      suspended: this.isSuspended(inst),
      cpuCores,
      memoryMb,
      swapMb: 0,
      diskMb,
      ioWeight: 500,
      slots: null,
      // No startup override export — server inherits the (synthesized) template.
      startupCommand: null,
      environment: {},
      dockerImage: null,
      allocationExternalIds,
      primaryAllocationExternalId: primary?.externalId ?? null,
      variables,
      subUsers,
    };
  }

  /** Derive memory/cpu/disk from AMP Metrics or explicit limit fields. */
  private instanceResources(inst: AmpInstance): {
    memoryMb: number;
    cpuCores: number;
    diskMb: number;
  } {
    let memoryMb = inst.MaxMemoryMB ?? 0;
    let diskMb = inst.DiskUsageMB ?? 0;
    // CPULimit is a percentage (100 = one core) on builds that expose it.
    let cpuCores = inst.CPULimit && inst.CPULimit > 0 ? inst.CPULimit / 100 : 0;

    const metrics = inst.Metrics ?? {};
    // Metric keys vary by build ("Memory Usage", "CPU Usage", ...). We probe a
    // few well-known names; MaxValue is the configured ceiling when present.
    // TODO(impl): metric key names differ across AMP versions; adjust as needed.
    for (const [name, m] of Object.entries(metrics)) {
      const lname = name.toLowerCase();
      if (memoryMb <= 0 && lname.includes('memory') && m.MaxValue) {
        memoryMb = m.MaxValue;
      }
    }

    if (memoryMb <= 0) memoryMb = 1024;
    if (cpuCores <= 0) cpuCores = 1;
    if (diskMb <= 0) diskMb = 5120;
    return { memoryMb, cpuCores, diskMb };
  }

  /** RunningState/Suspended -> ReFx suspended flag. */
  private isSuspended(inst: AmpInstance): boolean {
    if (inst.Suspended === true) return true;
    // AppState is an AMP RunningState enum; 0 == Stopped is not "suspended".
    // There is no clean suspended state over this API, so we rely on Suspended.
    return false;
  }
}
