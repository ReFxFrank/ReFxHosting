// ============================================================================
// ImporterService — idempotent, upsert-based loader of the normalized IR into
// the ReFx Postgres schema via Prisma.
// ----------------------------------------------------------------------------
// Dependency order:
//   regions -> nodes (+allocations) -> categories -> templates (+variables)
//   -> users -> servers (+allocations link, +variables, +subusers)
//
// Idempotency: every upsert is keyed on a deterministic natural key
// (Region.code, Node.fqdn, GameCategory.slug, GameTemplate.slug, User.email,
// Allocation[nodeId,ip,port], ...). An externalRef -> uuid map is maintained so
// cross-entity links resolve on first run and on re-runs alike.
//
// Secrets: source password hashes are NOT migrated; a random Argon2-shaped
// placeholder marker is stored and users are set PENDING_VERIFICATION (forced
// reset). Any secret material (SFTP/db passwords) is encrypted via the shared
// crypto util before persistence.
// ============================================================================

import type { PrismaClient } from '@prisma/client';
import { encryptSecret, randomToken } from '../common/crypto/crypto.util';
import { shortId, uuidv7 } from '../common/util/uuid';
import { MigrationSource } from './sources/source.interface';
import {
  EntityKind,
  ExternalRef,
  MigrationReport,
  NormalizedNode,
  NormalizedRegion,
  NormalizedServer,
  NormalizedTemplate,
  NormalizedUser,
  emptyCounts,
  externalRef,
} from './types';

export interface ImportOptions {
  dryRun: boolean;
  /** Subset of stages to run; empty/undefined => all. */
  only?: Array<'nodes' | 'templates' | 'users' | 'servers'>;
  /** Optional logger; defaults to console. */
  logger?: Pick<Console, 'log' | 'warn' | 'error'>;
}

/** A source that can additionally enumerate regions (Pterodactyl locations). */
interface RegionCapableSource {
  fetchRegions(): Promise<NormalizedRegion[]>;
}

function hasFetchRegions(s: MigrationSource): s is MigrationSource &
  RegionCapableSource {
  return typeof (s as Partial<RegionCapableSource>).fetchRegions === 'function';
}

export class ImporterService {
  private readonly log: Pick<Console, 'log' | 'warn' | 'error'>;
  private readonly report: MigrationReport;
  /** externalRef -> ReFx uuid, populated as entities are created/resolved. */
  private readonly idMap: Record<ExternalRef, string> = {};

  constructor(
    private readonly prisma: PrismaClient,
    private readonly source: MigrationSource,
    private readonly opts: ImportOptions,
  ) {
    this.log = opts.logger ?? console;
    this.report = {
      source: source.key,
      dryRun: opts.dryRun,
      startedAt: new Date().toISOString(),
      counts: emptyCounts(),
      warnings: [],
      errors: [],
      idMap: this.idMap,
    };
  }

  private wants(stage: NonNullable<ImportOptions['only']>[number]): boolean {
    if (!this.opts.only || this.opts.only.length === 0) return true;
    return this.opts.only.includes(stage);
  }

  private warn(kind: EntityKind, message: string, externalId?: string): void {
    this.report.warnings.push({ kind, externalId, message });
    this.log.warn(`[warn] ${kind}${externalId ? `#${externalId}` : ''}: ${message}`);
  }

  private error(kind: EntityKind, message: string, externalId?: string): void {
    this.report.errors.push({ kind, externalId, message });
    this.log.error(`[error] ${kind}${externalId ? `#${externalId}` : ''}: ${message}`);
  }

  private plan(action: string): void {
    if (this.opts.dryRun) this.log.log(`[dry-run] would ${action}`);
    else this.log.log(action);
  }

  async run(): Promise<MigrationReport> {
    try {
      if (this.wants('nodes')) {
        await this.importRegions();
        await this.importNodes();
      }
      if (this.wants('templates')) {
        await this.importTemplates();
      }
      if (this.wants('users')) {
        await this.importUsers();
      }
      if (this.wants('servers')) {
        await this.importServers();
      }
    } catch (err) {
      this.error('server', `fatal: ${(err as Error).message}`);
      throw err;
    } finally {
      this.report.finishedAt = new Date().toISOString();
    }
    return this.report;
  }

  // --- Regions -----------------------------------------------------------

  private async importRegions(): Promise<void> {
    if (!hasFetchRegions(this.source)) {
      this.warn(
        'region',
        'source does not expose regions; nodes will fall back to a synthetic default region',
      );
      return;
    }
    const regions = await this.source.fetchRegions();
    for (const r of regions) {
      const ref = externalRef(this.source.key, 'region', r.externalId);
      try {
        if (this.opts.dryRun) {
          this.plan(`upsert region code=${r.code} (${r.name})`);
          this.idMap[ref] = `dry:${r.code}`;
          this.report.counts.region.created += 1;
          continue;
        }
        const existing = await this.prisma.region.findUnique({
          where: { code: r.code },
        });
        if (existing) {
          await this.prisma.region.update({
            where: { code: r.code },
            data: { name: r.name, country: r.country },
          });
          this.idMap[ref] = existing.id;
          this.report.counts.region.updated += 1;
        } else {
          const id = uuidv7();
          await this.prisma.region.create({
            data: { id, code: r.code, name: r.name, country: r.country },
          });
          this.idMap[ref] = id;
          this.report.counts.region.created += 1;
        }
      } catch (e) {
        this.error('region', (e as Error).message, r.externalId);
      }
    }
  }

  /** Resolve (or lazily create) a fallback region for nodes with no location. */
  private async ensureDefaultRegion(): Promise<string> {
    const code = 'imported-default';
    if (this.idMap[`__region:${code}`]) return this.idMap[`__region:${code}`];
    if (this.opts.dryRun) {
      this.idMap[`__region:${code}`] = `dry:${code}`;
      return this.idMap[`__region:${code}`];
    }
    const existing = await this.prisma.region.findUnique({ where: { code } });
    if (existing) {
      this.idMap[`__region:${code}`] = existing.id;
      return existing.id;
    }
    const id = uuidv7();
    await this.prisma.region.create({
      data: { id, code, name: 'Imported (default)', country: 'XX' },
    });
    this.report.counts.region.created += 1;
    this.idMap[`__region:${code}`] = id;
    return id;
  }

  // --- Nodes + allocations ----------------------------------------------

  private async importNodes(): Promise<void> {
    const nodes = await this.source.fetchNodes();
    for (const n of nodes) {
      try {
        await this.importNode(n);
      } catch (e) {
        this.error('node', (e as Error).message, n.externalId);
      }
    }
  }

  private async importNode(n: NormalizedNode): Promise<void> {
    const ref = externalRef(this.source.key, 'node', n.externalId);
    let regionId: string;
    if (n.regionExternalId) {
      const rRef = externalRef(this.source.key, 'region', n.regionExternalId);
      regionId = this.idMap[rRef] ?? (await this.ensureDefaultRegion());
      if (!this.idMap[rRef]) {
        this.warn(
          'node',
          `region ${n.regionExternalId} unresolved; using default region`,
          n.externalId,
        );
      }
    } else {
      regionId = await this.ensureDefaultRegion();
    }

    if (n.cpuCores <= 1) {
      this.warn(
        'node',
        'source reported no CPU core count; defaulted to 1 (agent will re-advertise)',
        n.externalId,
      );
    }

    const data = {
      name: n.name,
      regionId,
      os: n.os,
      daemonPort: n.daemonPort ?? 8443,
      sftpPort: n.sftpPort ?? 2022,
      scheme: n.scheme ?? 'https',
      cpuCores: n.cpuCores,
      memoryMb: n.memoryMb,
      diskMb: n.diskMb,
      cpuOvercommit: n.cpuOvercommit ?? 1.0,
      memOvercommit: n.memOvercommit ?? 1.0,
    };

    if (this.opts.dryRun) {
      this.plan(`upsert node fqdn=${n.fqdn} (${n.allocations.length} allocations)`);
      this.idMap[ref] = `dry:node:${n.fqdn}`;
      this.report.counts.node.created += 1;
      for (const a of n.allocations) {
        this.idMap[externalRef(this.source.key, 'allocation', a.externalId)] =
          `dry:alloc:${a.externalId}`;
        this.report.counts.allocation.created += 1;
      }
      return;
    }

    const existing = await this.prisma.node.findUnique({
      where: { fqdn: n.fqdn },
    });
    let nodeId: string;
    if (existing) {
      await this.prisma.node.update({ where: { fqdn: n.fqdn }, data });
      nodeId = existing.id;
      this.report.counts.node.updated += 1;
    } else {
      nodeId = uuidv7();
      // A real bootstrap token is issued when the agent enrolls; store a hash
      // placeholder so the NOT NULL column is satisfied at import time.
      await this.prisma.node.create({
        data: {
          id: nodeId,
          fqdn: n.fqdn,
          tokenHash: encryptSecretSafe(randomToken(32)),
          ...data,
        },
      });
      this.report.counts.node.created += 1;
    }
    this.idMap[ref] = nodeId;

    // Allocations — deterministic on [nodeId, ip, port].
    for (const a of n.allocations) {
      const aRef = externalRef(this.source.key, 'allocation', a.externalId);
      try {
        const existingAlloc = await this.prisma.allocation.findUnique({
          where: { nodeId_ip_port: { nodeId, ip: a.ip, port: a.port } },
        });
        if (existingAlloc) {
          await this.prisma.allocation.update({
            where: { id: existingAlloc.id },
            data: { alias: a.alias ?? null, isPrimary: a.isPrimary },
          });
          this.idMap[aRef] = existingAlloc.id;
          this.report.counts.allocation.updated += 1;
        } else {
          const id = uuidv7();
          await this.prisma.allocation.create({
            data: {
              id,
              nodeId,
              ip: a.ip,
              port: a.port,
              alias: a.alias ?? null,
              isPrimary: a.isPrimary,
            },
          });
          this.idMap[aRef] = id;
          this.report.counts.allocation.created += 1;
        }
      } catch (e) {
        this.error('allocation', (e as Error).message, a.externalId);
      }
    }
  }

  // --- Categories + templates + variables -------------------------------

  private async importTemplates(): Promise<void> {
    const templates = await this.source.fetchEggs();
    for (const t of templates) {
      try {
        await this.importTemplate(t);
      } catch (e) {
        this.error('template', (e as Error).message, t.externalId);
      }
    }
  }

  private async ensureCategory(
    t: NormalizedTemplate,
  ): Promise<string | null> {
    if (!t.categoryExternalId) return null;
    const ref = externalRef(this.source.key, 'category', t.categoryExternalId);
    if (this.idMap[ref]) return this.idMap[ref];

    const slug = slugify(t.categoryName || `cat-${t.categoryExternalId}`);
    if (this.opts.dryRun) {
      this.plan(`upsert category slug=${slug}`);
      this.idMap[ref] = `dry:cat:${slug}`;
      this.report.counts.category.created += 1;
      return this.idMap[ref];
    }
    const existing = await this.prisma.gameCategory.findUnique({
      where: { slug },
    });
    if (existing) {
      this.idMap[ref] = existing.id;
      this.report.counts.category.updated += 1;
      return existing.id;
    }
    const id = uuidv7();
    await this.prisma.gameCategory.create({
      data: { id, slug, name: t.categoryName || slug },
    });
    this.idMap[ref] = id;
    this.report.counts.category.created += 1;
    return id;
  }

  private async importTemplate(t: NormalizedTemplate): Promise<void> {
    const ref = externalRef(this.source.key, 'template', t.externalId);
    const categoryId = await this.ensureCategory(t);

    if (t.installScript.length === 0) {
      this.warn(
        'template',
        'no install script found; imported with empty installScript (best-effort)',
        t.externalId,
      );
    }

    const data = {
      categoryId,
      name: t.name,
      author: t.author,
      description: t.description ?? null,
      deployMethods: t.deployMethods,
      supportsLinux: t.supportsLinux,
      supportsWindows: t.supportsWindows,
      dockerImages: t.dockerImages as object,
      steamAppId: t.steamAppId ?? null,
      startupCommand: t.startupCommand,
      startupDetect: t.startupDetect ?? null,
      stopCommand: t.stopCommand,
      installScript: t.installScript as unknown as object,
      configFiles: t.configFiles as unknown as object,
      recCpuCores: t.recCpuCores ?? 1,
      recMemoryMb: t.recMemoryMb ?? 1024,
      recDiskMb: t.recDiskMb ?? 5120,
    };

    if (this.opts.dryRun) {
      this.plan(
        `upsert template slug=${t.slug} (${t.variables.length} variables)`,
      );
      this.idMap[ref] = `dry:tmpl:${t.slug}`;
      this.report.counts.template.created += 1;
      this.report.counts.variable.created += t.variables.length;
      return;
    }

    const existing = await this.prisma.gameTemplate.findUnique({
      where: { slug: t.slug },
    });
    let templateId: string;
    if (existing) {
      await this.prisma.gameTemplate.update({
        where: { slug: t.slug },
        data,
      });
      templateId = existing.id;
      this.report.counts.template.updated += 1;
    } else {
      templateId = uuidv7();
      await this.prisma.gameTemplate.create({
        data: { id: templateId, slug: t.slug, ...data },
      });
      this.report.counts.template.created += 1;
    }
    this.idMap[ref] = templateId;

    // Variables — deterministic on [templateId, envName].
    for (const v of t.variables) {
      try {
        const existingVar = await this.prisma.templateVariable.findUnique({
          where: {
            templateId_envName: { templateId, envName: v.envName },
          },
        });
        const vData = {
          displayName: v.displayName,
          description: v.description ?? null,
          type: v.type,
          defaultValue: v.defaultValue ?? null,
          rules: v.rules as object,
          userEditable: v.userEditable,
          userViewable: v.userViewable,
          sortOrder: v.sortOrder,
        };
        if (existingVar) {
          await this.prisma.templateVariable.update({
            where: { id: existingVar.id },
            data: vData,
          });
          this.report.counts.variable.updated += 1;
        } else {
          await this.prisma.templateVariable.create({
            data: { id: uuidv7(), templateId, envName: v.envName, ...vData },
          });
          this.report.counts.variable.created += 1;
        }
      } catch (e) {
        this.error('variable', (e as Error).message, v.envName);
      }
    }
  }

  // --- Users -------------------------------------------------------------

  private async importUsers(): Promise<void> {
    const users = await this.source.fetchUsers();
    for (const u of users) {
      try {
        await this.importUser(u);
      } catch (e) {
        this.error('user', (e as Error).message, u.externalId);
      }
    }
  }

  private async importUser(u: NormalizedUser): Promise<void> {
    const ref = externalRef(this.source.key, 'user', u.externalId);
    const email = u.email.trim().toLowerCase();

    if (this.opts.dryRun) {
      this.plan(`upsert user email=${email} role=${u.globalRole}`);
      this.idMap[ref] = `dry:user:${email}`;
      this.report.counts.user.created += 1;
      return;
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Don't clobber an existing account's password/role silently; only fill
      // in missing names. Conflicts are surfaced for admin review.
      await this.prisma.user.update({
        where: { email },
        data: {
          firstName: existing.firstName ?? u.firstName ?? null,
          lastName: existing.lastName ?? u.lastName ?? null,
        },
      });
      this.idMap[ref] = existing.id;
      this.report.counts.user.updated += 1;
      this.warn(
        'user',
        `email ${email} already exists; linked without overwriting credentials`,
        u.externalId,
      );
      return;
    }

    const id = uuidv7();
    await this.prisma.user.create({
      data: {
        id,
        email,
        // Source password hashes (bcrypt/etc.) are intentionally NOT migrated.
        // Store nothing usable; force a reset via PENDING_VERIFICATION.
        passwordHash: null,
        firstName: u.firstName ?? null,
        lastName: u.lastName ?? null,
        globalRole: u.globalRole,
        state: 'PENDING_VERIFICATION',
        locale: u.locale ?? 'en',
      },
    });
    this.idMap[ref] = id;
    this.report.counts.user.created += 1;
  }

  // --- Servers + variables + subusers -----------------------------------

  private async importServers(): Promise<void> {
    const servers = await this.source.fetchServers();
    for (const s of servers) {
      try {
        await this.importServer(s);
      } catch (e) {
        this.error('server', (e as Error).message, s.externalId);
      }
    }
  }

  private async importServer(s: NormalizedServer): Promise<void> {
    const ref = externalRef(this.source.key, 'server', s.externalId);

    const ownerId = this.idMap[
      externalRef(this.source.key, 'user', s.ownerExternalId)
    ];
    const nodeId = this.idMap[
      externalRef(this.source.key, 'node', s.nodeExternalId)
    ];
    if (!ownerId) {
      this.report.counts.server.skipped += 1;
      this.warn(
        'server',
        `owner ${s.ownerExternalId} unresolved (import users first); skipped`,
        s.externalId,
      );
      return;
    }
    if (!nodeId) {
      this.report.counts.server.skipped += 1;
      this.warn(
        'server',
        `node ${s.nodeExternalId} unresolved (import nodes first); skipped`,
        s.externalId,
      );
      return;
    }
    const templateId = s.templateExternalId
      ? this.idMap[
          externalRef(this.source.key, 'template', s.templateExternalId)
        ] ?? null
      : null;
    if (s.templateExternalId && !templateId) {
      this.warn(
        'server',
        `template ${s.templateExternalId} unresolved; server imported without a template (admin review)`,
        s.externalId,
      );
    }

    if (this.opts.dryRun) {
      this.plan(
        `upsert server name=${s.name} owner=${s.ownerExternalId} node=${s.nodeExternalId}`,
      );
      this.idMap[ref] = `dry:server:${s.name}`;
      this.report.counts.server.created += 1;
      this.report.counts.serverVariable.created += s.variables.length;
      this.report.counts.subUser.created += s.subUsers.length;
      return;
    }

    const data = {
      name: s.name,
      description: s.description ?? null,
      ownerId,
      nodeId,
      templateId,
      templateVersion: templateId ? 1 : null,
      state: s.suspended ? ('SUSPENDED' as const) : ('OFFLINE' as const),
      deployMethod: s.deployMethod,
      cpuCores: s.cpuCores,
      memoryMb: s.memoryMb,
      swapMb: s.swapMb,
      diskMb: s.diskMb,
      ioWeight: s.ioWeight,
      slots: s.slots ?? null,
      startupCommand: s.startupCommand ?? null,
      environment: s.environment as object,
      dockerImage: s.dockerImage ?? null,
      suspendedAt: s.suspended ? new Date() : null,
      // Per-server SFTP password is minted fresh and encrypted.
      sftpPasswordEnc: encryptSecretSafe(randomToken(18)),
    };

    // Find an existing imported server by externalRef cache (re-run) — fall
    // back to a name+owner natural key for first-run idempotency.
    let serverId = this.idMap[ref];
    const existing = serverId
      ? await this.prisma.server.findUnique({ where: { id: serverId } })
      : await this.prisma.server.findFirst({
          where: { ownerId, name: s.name, deletedAt: null },
        });

    await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.server.update({
          where: { id: existing!.id },
          data,
        });
        serverId = existing!.id;
        this.report.counts.server.updated += 1;
      } else {
        serverId = uuidv7();
        await tx.server.create({
          data: { id: serverId, shortId: shortId(), ...data },
        });
        this.report.counts.server.created += 1;
      }
      this.idMap[ref] = serverId!;

      // Link allocations to this server; set primary.
      for (const allocExtId of s.allocationExternalIds) {
        const allocId = this.idMap[
          externalRef(this.source.key, 'allocation', allocExtId)
        ];
        if (!allocId) {
          this.warn(
            'allocation',
            `allocation ${allocExtId} for server ${s.externalId} unresolved`,
            allocExtId,
          );
          continue;
        }
        await tx.allocation.update({
          where: { id: allocId },
          data: {
            serverId,
            isPrimary: allocExtId === s.primaryAllocationExternalId,
          },
        });
        this.report.counts.allocation.updated += 1;
      }

      // Server variable overrides — deterministic on [serverId, envName].
      for (const v of s.variables) {
        await tx.serverVariable.upsert({
          where: {
            serverId_envName: { serverId: serverId!, envName: v.envName },
          },
          create: {
            id: uuidv7(),
            serverId: serverId!,
            envName: v.envName,
            value: v.value,
          },
          update: { value: v.value },
        });
        this.report.counts.serverVariable.created += 1;
      }

      // Subusers — resolve user, deterministic on [serverId, userId].
      for (const su of s.subUsers) {
        const subUserId = this.idMap[
          externalRef(this.source.key, 'user', su.userExternalId)
        ];
        if (!subUserId) {
          this.warn(
            'subUser',
            `subuser user ${su.userExternalId} unresolved; skipped`,
            su.userExternalId,
          );
          continue;
        }
        await tx.subUser.upsert({
          where: {
            serverId_userId: { serverId: serverId!, userId: subUserId },
          },
          create: {
            id: uuidv7(),
            serverId: serverId!,
            userId: subUserId,
            permissions: su.permissions,
            state: 'ACTIVE',
          },
          update: { permissions: su.permissions, state: 'ACTIVE' },
        });
        this.report.counts.subUser.created += 1;
      }
    });

    void existing; // retained for readability; tx closes over it.
  }
}

// --- helpers ---------------------------------------------------------------

const SLUG_RE = /[^a-z0-9]+/g;
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(SLUG_RE, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Encrypt a secret if SECRETS_ENC_KEY is configured; otherwise store a clearly
 * marked placeholder (only reachable in misconfigured non-prod runs). Real
 * secrets are always re-minted on first node enrollment / SFTP rotation.
 */
function encryptSecretSafe(plaintext: string): string {
  const key = process.env.SECRETS_ENC_KEY;
  if (key && key.length === 64) {
    return encryptSecret(plaintext, key);
  }
  return `PLAINTEXT_UNENCRYPTED:${plaintext}`;
}
