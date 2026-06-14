// ============================================================================
// Pterodactyl source — extracts from the Pterodactyl Application API.
// ----------------------------------------------------------------------------
// Pterodactyl exposes a JSON:API style Application API. We read (never write):
//
//   GET /api/application/users
//   GET /api/application/locations
//   GET /api/application/nodes
//   GET /api/application/nodes/{id}/allocations
//   GET /api/application/servers?include=allocations,variables
//   GET /api/application/nests
//   GET /api/application/nests/{id}/eggs?include=variables
//
// Auth: `Authorization: Bearer <PTERO_APP_KEY>` + `Accept: application/json`.
// All list endpoints are paginated (meta.pagination); we follow every page.
//
// Mapping follows docs/11-migration.md. Pterodactyl is Docker/Linux only, so
// templates default to deployMethods=[DOCKER], supportsLinux=true.
// ============================================================================

import type { DeployMethod, VariableType } from '@prisma/client';
import {
  NormalizedAllocation,
  NormalizedNode,
  NormalizedRegion,
  NormalizedServer,
  NormalizedServerVariable,
  NormalizedSubUser,
  NormalizedTemplate,
  NormalizedTemplateVariable,
  NormalizedInstallStep,
  NormalizedUser,
} from '../types';
import { MigrationSource } from './source.interface';

// --- Pterodactyl JSON:API envelope shapes (only the fields we read) ---------

interface PteroObject<A> {
  object: string;
  attributes: A;
  // include relationships, e.g. { allocations: PteroList<...> }
  relationships?: Record<string, PteroList<unknown> | PteroResource<unknown>>;
}
interface PteroResource<A> {
  object: string;
  attributes: A;
}
interface PteroList<A> {
  object: 'list';
  data: PteroObject<A>[];
  meta?: {
    pagination?: {
      total: number;
      count: number;
      per_page: number;
      current_page: number;
      total_pages: number;
    };
  };
}

interface PteroUser {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  language?: string;
  root_admin: boolean;
  '2fa'?: boolean;
}

interface PteroLocation {
  id: number;
  short: string;
  long?: string;
}

interface PteroNode {
  id: number;
  name: string;
  location_id: number;
  fqdn: string;
  scheme: string;
  daemon_listen: number;
  daemon_sftp: number;
  memory: number; // MiB
  memory_overallocate: number; // percent, -1 = unlimited
  disk: number; // MiB
  disk_overallocate: number;
  // Pterodactyl has no real CPU core count on a node; it tracks oversell only.
  // We approximate cores from a derived field when present.
}

interface PteroAllocation {
  id: number;
  ip: string;
  alias?: string | null;
  port: number;
  assigned: boolean;
}

interface PteroVariableValue {
  // server-level "variables" include: the resolved value + the env_variable.
  id: number;
  env_variable: string;
  server_value?: string | null;
  default_value?: string | null;
}

interface PteroServerLimits {
  memory: number;
  swap: number;
  disk: number;
  io: number;
  cpu: number; // percent (100 = 1 core)
}

interface PteroServer {
  id: number;
  uuid: string;
  identifier: string;
  name: string;
  description?: string | null;
  suspended: boolean;
  user: number; // owner id
  node: number;
  egg: number;
  container?: {
    startup_command?: string | null;
    image?: string | null;
    environment?: Record<string, string | number | boolean>;
  };
  limits: PteroServerLimits;
}

interface PteroEggVariable {
  name: string;
  description?: string | null;
  env_variable: string;
  default_value?: string | null;
  user_viewable: boolean;
  user_editable: boolean;
  rules: string; // Laravel pipe rules, e.g. "required|string|max:20"
}

interface PteroEgg {
  id: number;
  nest: number;
  author: string;
  name: string;
  description?: string | null;
  docker_image?: string | null;
  docker_images?: Record<string, string>;
  startup: string;
  script_install?: string | null;
  script_container?: string | null;
  script_entry?: string | null;
  config_startup?: string | null; // JSON string: {"done": "...", ...}
  config_stop?: string | null;
  config_files?: string | null; // JSON string
}

interface PteroNest {
  id: number;
  name: string;
}

export interface PterodactylSourceOptions {
  /** Base panel URL, e.g. https://panel.example.com (no trailing /api). */
  url: string;
  /** Application API key (ptla_...). */
  key: string;
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

export class PterodactylSource implements MigrationSource {
  readonly key = 'pterodactyl';

  private readonly base: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: PterodactylSourceOptions) {
    this.base = opts.url.replace(/\/+$/, '');
    this.apiKey = opts.key;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  // --- HTTP --------------------------------------------------------------

  private async getOne<A>(path: string): Promise<PteroResource<A>> {
    const res = await this.fetchImpl(`${this.base}/api/application${path}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(
        `Pterodactyl GET ${path} failed: ${res.status} ${res.statusText}`,
      );
    }
    return (await res.json()) as PteroResource<A>;
  }

  /** Fetch every page of a list endpoint and concatenate `data`. */
  private async getAll<A>(path: string): Promise<PteroObject<A>[]> {
    const out: PteroObject<A>[] = [];
    let page = 1;
    // Pterodactyl caps per_page at 100.
    for (;;) {
      const sep = path.includes('?') ? '&' : '?';
      const url = `${this.base}/api/application${path}${sep}page=${page}&per_page=100`;
      const res = await this.fetchImpl(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        throw new Error(
          `Pterodactyl GET ${path} (page ${page}) failed: ${res.status} ${res.statusText}`,
        );
      }
      const body = (await res.json()) as PteroList<A>;
      out.push(...body.data);
      const pg = body.meta?.pagination;
      if (!pg || pg.current_page >= pg.total_pages || body.data.length === 0) {
        break;
      }
      page += 1;
    }
    return out;
  }

  // --- Users -------------------------------------------------------------

  async fetchUsers(): Promise<NormalizedUser[]> {
    const rows = await this.getAll<PteroUser>('/users');
    return rows.map((r) => {
      const a = r.attributes;
      return {
        externalId: String(a.id),
        email: a.email,
        firstName: a.first_name ?? null,
        lastName: a.last_name ?? null,
        // root_admin -> ADMIN. There is no distinct OWNER concept in Ptero;
        // the panel operator promotes one ADMIN to OWNER post-import.
        globalRole: a.root_admin ? 'ADMIN' : 'CUSTOMER',
        locale: a.language ?? null,
        emailVerified: true,
      };
    });
  }

  // --- Regions (Pterodactyl Locations) -----------------------------------
  // Not on the MigrationSource interface; the importer feature-detects this so
  // node.regionExternalId resolves to a real Region row.

  async fetchRegions(): Promise<NormalizedRegion[]> {
    const rows = await this.getAll<PteroLocation>('/locations');
    return rows.map((r) => {
      const a = r.attributes;
      return {
        externalId: String(a.id),
        code: slugify(a.short) || `loc-${a.id}`,
        name: a.long || a.short,
        // Pterodactyl locations have no country field; admin fills it in.
        country: 'XX',
      };
    });
  }

  // --- Nodes + allocations ----------------------------------------------

  async fetchNodes(): Promise<NormalizedNode[]> {
    const rows = await this.getAll<PteroNode>('/nodes');
    const nodes: NormalizedNode[] = [];
    for (const r of rows) {
      const a = r.attributes;
      const allocRows = await this.getAll<PteroAllocation>(
        `/nodes/${a.id}/allocations`,
      );
      const allocations: NormalizedAllocation[] = allocRows.map((ar) => {
        const av = ar.attributes;
        return {
          externalId: String(av.id),
          ip: av.ip,
          port: av.port,
          alias: av.alias ?? null,
          // Pterodactyl has no node-level "primary"; primacy is per-server.
          isPrimary: false,
        };
      });
      nodes.push({
        externalId: String(a.id),
        name: a.name,
        fqdn: a.fqdn,
        regionExternalId: String(a.location_id),
        os: 'LINUX', // Pterodactyl is Linux/Docker only.
        daemonPort: a.daemon_listen ?? 8443,
        sftpPort: a.daemon_sftp ?? 2022,
        scheme: a.scheme ?? 'https',
        // Pterodactyl tracks no CPU core count; default to a sane minimum and
        // let the agent re-advertise real capacity. Recorded as a warning by
        // the importer.
        cpuCores: 1,
        memoryMb: a.memory,
        diskMb: a.disk,
        cpuOvercommit: 1.0,
        memOvercommit:
          a.memory_overallocate > 0 ? 1 + a.memory_overallocate / 100 : 1.0,
        allocations,
      });
    }
    return nodes;
  }

  // --- Eggs (game definitions) ------------------------------------------

  async fetchEggs(): Promise<NormalizedTemplate[]> {
    const nests = await this.getAll<PteroNest>('/nests');
    const templates: NormalizedTemplate[] = [];
    for (const nest of nests) {
      const nestId = nest.attributes.id;
      const eggs = await this.getAll<PteroEgg>(
        `/nests/${nestId}/eggs?include=variables`,
      );
      for (const e of eggs) {
        templates.push(this.mapEgg(e.attributes, e, nest.attributes));
      }
    }
    return templates;
  }

  private mapEgg(
    a: PteroEgg,
    raw: PteroObject<PteroEgg>,
    nest: PteroNest,
  ): NormalizedTemplate {
    // docker_images is the modern field; fall back to single docker_image.
    let dockerImages: Record<string, string> = {};
    if (a.docker_images && Object.keys(a.docker_images).length > 0) {
      dockerImages = a.docker_images;
    } else if (a.docker_image) {
      dockerImages = { default: a.docker_image };
    }

    // config.startup.done -> startupDetect ; config.stop -> stopCommand.
    let startupDetect: string | null = null;
    if (a.config_startup) {
      try {
        const cfg = JSON.parse(a.config_startup) as { done?: string | string[] };
        if (Array.isArray(cfg.done)) startupDetect = cfg.done[0] ?? null;
        else startupDetect = cfg.done ?? null;
      } catch {
        /* leave null; recorded as warning by importer if needed */
      }
    }

    let configFiles: unknown[] = [];
    if (a.config_files) {
      try {
        const parsed = JSON.parse(a.config_files) as unknown;
        configFiles = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        configFiles = [];
      }
    }

    // Install script: Pterodactyl stores one script + container + entrypoint.
    const installScript: NormalizedInstallStep[] = a.script_install
      ? [
          {
            container: a.script_container || 'ghcr.io/pterodactyl/installers:debian',
            entrypoint: a.script_entry || 'bash',
            script: a.script_install,
          },
        ]
      : [];

    // Egg variables come via the `variables` relationship include.
    const varList =
      (raw.relationships?.variables as PteroList<PteroEggVariable> | undefined)
        ?.data ?? [];
    const variables: NormalizedTemplateVariable[] = varList.map((v, i) =>
      this.mapEggVariable(v.attributes, i),
    );

    return {
      externalId: String(a.id),
      categoryExternalId: String(nest.id),
      categoryName: nest.name,
      name: a.name,
      slug: `${slugify(nest.name)}-${slugify(a.name)}` || `egg-${a.id}`,
      author: a.author,
      description: a.description ?? null,
      deployMethods: ['DOCKER'] as DeployMethod[],
      supportsLinux: true,
      supportsWindows: false,
      dockerImages,
      steamAppId: null,
      // {{VAR}} mustache is compatible with ReFx {{VAR}} interpolation.
      startupCommand: a.startup,
      startupDetect,
      stopCommand: a.config_stop || '^C',
      installScript,
      configFiles,
      recCpuCores: 1,
      recMemoryMb: 1024,
      recDiskMb: 5120,
      variables,
    };
  }

  /** Translate Pterodactyl/Laravel rule strings into ReFx rules + type. */
  private mapEggVariable(
    v: PteroEggVariable,
    sortOrder: number,
  ): NormalizedTemplateVariable {
    const ruleStr = v.rules || '';
    const ruleTokens = ruleStr
      .split('|')
      .map((t) => t.trim())
      .filter(Boolean);

    const rules: Record<string, unknown> = {};
    let type: VariableType = 'STRING';

    for (const tok of ruleTokens) {
      const [name, arg] = tok.split(':');
      switch (name) {
        case 'required':
          rules.required = true;
          break;
        case 'nullable':
          rules.required = false;
          break;
        case 'numeric':
        case 'integer':
          type = 'NUMBER';
          break;
        case 'boolean':
          type = 'BOOLEAN';
          break;
        case 'string':
          // keep STRING unless a stronger signal overrides
          break;
        case 'min':
          if (arg !== undefined) rules.min = Number(arg);
          break;
        case 'max':
          if (arg !== undefined) rules.max = Number(arg);
          break;
        case 'between': {
          if (arg) {
            const [lo, hi] = arg.split(',');
            rules.min = Number(lo);
            rules.max = Number(hi);
          }
          break;
        }
        case 'regex':
          if (arg) rules.regex = arg.replace(/^\//, '').replace(/\/[a-z]*$/, '');
          break;
        case 'in': {
          if (arg) {
            const options = arg.split(',');
            rules.options = options;
            type = 'ENUM';
          }
          break;
        }
        default:
          break;
      }
    }

    // SECRET heuristic: name/env hints at a token/password/key.
    const secretHint = /(password|secret|token|api[_-]?key)/i;
    if (
      type === 'STRING' &&
      (secretHint.test(v.env_variable) || secretHint.test(v.name))
    ) {
      type = 'SECRET';
    }

    return {
      envName: v.env_variable,
      displayName: v.name,
      description: v.description ?? null,
      type,
      defaultValue: v.default_value ?? null,
      rules,
      userEditable: v.user_editable,
      userViewable: v.user_viewable,
      sortOrder,
    };
  }

  // --- Servers -----------------------------------------------------------

  async fetchServers(): Promise<NormalizedServer[]> {
    const rows = await this.getAll<PteroServer>(
      '/servers?include=allocations,variables',
    );
    return rows.map((r) => this.mapServer(r));
  }

  private mapServer(r: PteroObject<PteroServer>): NormalizedServer {
    const a = r.attributes;

    // Allocations include.
    const allocRel = r.relationships?.allocations as
      | PteroList<PteroAllocation & { id: number }>
      | undefined;
    const allocs = allocRel?.data ?? [];
    const allocationExternalIds = allocs.map((x) => String(x.attributes.id));
    // Pterodactyl marks the default allocation `assigned` + first in list; the
    // server's default allocation id is exposed on container in older versions.
    // We treat the first allocation as primary (best-effort).
    const primaryAllocationExternalId =
      allocationExternalIds.length > 0 ? allocationExternalIds[0] : null;

    // Variables include carries resolved per-server values.
    const varRel = r.relationships?.variables as
      | PteroList<PteroVariableValue>
      | undefined;
    const variables: NormalizedServerVariable[] = [];
    const environment: Record<string, string> = {};

    // Prefer the container.environment map (already resolved), then overlay
    // explicit variable rows so ServerVariable overrides are captured.
    if (a.container?.environment) {
      for (const [k, val] of Object.entries(a.container.environment)) {
        environment[k] = String(val);
      }
    }
    for (const vr of varRel?.data ?? []) {
      const vv = vr.attributes;
      const value =
        vv.server_value != null ? vv.server_value : vv.default_value ?? '';
      environment[vv.env_variable] = String(value);
      // Only record an override row when it differs from the egg default.
      if (vv.server_value != null && vv.server_value !== vv.default_value) {
        variables.push({ envName: vv.env_variable, value: String(value) });
      }
    }

    // Limits. cpu is a percentage (100 = 1 core) -> cpuCores float.
    const cpuCores = a.limits.cpu > 0 ? a.limits.cpu / 100 : 1;

    // Subusers are not on the application server endpoint; left empty here and
    // backfilled later (client API / DB). Recorded as a warning by importer.
    const subUsers: NormalizedSubUser[] = [];

    return {
      externalId: String(a.id),
      name: a.name,
      description: a.description ?? null,
      ownerExternalId: String(a.user),
      nodeExternalId: String(a.node),
      templateExternalId: String(a.egg),
      deployMethod: 'DOCKER',
      suspended: a.suspended,
      cpuCores,
      memoryMb: a.limits.memory,
      swapMb: a.limits.swap > 0 ? a.limits.swap : 0,
      diskMb: a.limits.disk,
      ioWeight: a.limits.io ?? 500,
      slots: null,
      startupCommand: a.container?.startup_command ?? null,
      environment,
      dockerImage: a.container?.image ?? null,
      allocationExternalIds,
      primaryAllocationExternalId,
      variables,
      subUsers,
    };
  }
}
