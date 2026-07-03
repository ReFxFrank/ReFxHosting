import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { unzipSync } from 'fflate';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AGENT_MAX_UPLOAD_BYTES,
  NodeAgentClient,
} from '../../agent/agent.client';
import { CryptoService } from '../../common/crypto/crypto.service';
import { ServersService } from '../../servers/servers.service';
import { ModrinthService } from '../../servers/modrinth.service';
import { uuidv7 } from '../../common/util/uuid';
import {
  JOB,
  ModpackInstallJob,
  ModpackUninstallJob,
  ServerPackInstallJob,
  QUEUE,
} from '../queue.constants';
import { buildInstallSpec } from './install-spec.util';

const USER_AGENT = 'ReFxHosting/1.0 (game-server-panel)';
// The .mrpack is an index + bundled config/overrides (mods download separately).
// Most packs are small, but big ones (e.g. COBBLEVERSE bundles a large resource
// pack/datapacks) can be a few hundred MiB. The panel downloads + unzips it in
// memory, so cap it high enough for real packs but still bounded.
const MRPACK_MAX_BYTES = 512 * 1024 * 1024;
// Upper bound for a single mod the agent will pull directly from Modrinth, to
// avoid a pathological entry filling the node's disk. The agent streams these to
// disk, so this is far larger than the signed-upload cap used for overrides.
const MAX_MOD_BYTES = 1024 * 1024 * 1024;
// Marker file written to the server's data dir recording the installed pack, so
// the Modpacks tab can show what's installed and offer an uninstall. Read back
// via the agent's file manager (same pattern as TeamSpeak's refx-voice.json).
const MODPACK_MARKER = '.refx-modpack.json';

// Well-known CLIENT-ONLY mods (rendering, shaders, UI, texture/model tweaks).
// Fabric silently skips env=client mods on a dedicated server, but Forge/NeoForge
// try to load them and HARD-CRASH ("clientside only mod … refusing" / "invalid
// dist DEDICATED_SERVER"). Packs that bundle these as overrides (no env metadata)
// or don't flag env.server=unsupported would otherwise ship them to the server.
// We strip any jar whose normalized name contains one of these slugs. Best-effort
// safety net — the authoritative fix for big packs is the author's server pack.
const CLIENT_ONLY_MOD_SLUGS = [
  'entitymodelfeatures',
  'entitytexturefeatures',
  'citresewn',
  'oculus',
  'iris',
  'sodium',
  'rubidium',
  'embeddium',
  'reesessodiumoptions',
  'sodiumextra',
  'indium',
  'modmenu',
  'controlify',
  'fancymenu',
  'drippyloadingscreen',
  'skinlayers3d',
  '3dskinlayers',
  'legendarytooltips',
  'badoptimizations',
  'yungsmenutweaks',
  'notenoughanimations',
  'betterthirdperson',
];

/** A single entry in modrinth.index.json. */
interface MrpackFile {
  path: string;
  downloads: string[];
  fileSize?: number;
  env?: { client?: string; server?: string };
}
interface MrpackIndex {
  formatVersion: number;
  files: MrpackFile[];
  dependencies: Record<string, string>;
}

/**
 * Installs a Modrinth modpack (.mrpack) onto a Minecraft server:
 *   1. resolve the pack's required MC version + loader (+ loader version),
 *   2. switch the server to it and reinstall (preserving worlds),
 *   3. wipe pack-managed content (mods/ + leftover worldgen datapacks) so nothing
 *      from a previous pack/loader can linger,
 *   4. download EVERY server-required mod (with retries), verify the set is
 *      complete, then apply the pack's config overrides.
 * Runs as a background job because it touches many files and the network.
 *
 * A partial install is treated as a failure, not a success: a modpack missing
 * a server-required jar boots into "Unbound values in registry
 * worldgen/structure … Failed to load datapacks", because a leftover/undelivered
 * structure_set references structures whose provider mod isn't present. The old
 * flow cleared only top-level mods/*.jar and counted failed downloads as silent
 * skips, so a dirty/incomplete mods/ could masquerade as a good install — this
 * processor closes both gaps.
 */
@Processor(QUEUE.MODPACK)
export class ModpackProcessor extends WorkerHost {
  private readonly logger = new Logger(ModpackProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: NodeAgentClient,
    private readonly crypto: CryptoService,
    private readonly servers: ServersService,
    private readonly modrinth: ModrinthService,
  ) {
    super();
  }

  async process(
    job: Job<
      ModpackInstallJob | ModpackUninstallJob | ServerPackInstallJob
    >,
  ): Promise<void> {
    if (job.name === JOB.UNINSTALL_MODPACK) {
      return this.processUninstall(job as Job<ModpackUninstallJob>);
    }
    if (job.name === JOB.INSTALL_SERVER_PACK) {
      return this.processServerPack(job as Job<ServerPackInstallJob>);
    }
    if (job.name !== JOB.INSTALL_MODPACK) return;
    const { serverId, versionId, title } = job.data as ModpackInstallJob;
    const label = title || 'modpack';

    try {
      await this.install(serverId, versionId);
      await this.prisma.server.update({
        where: { id: serverId },
        data: { state: 'OFFLINE' },
      });
      await this.notify(
        serverId,
        `Modpack installed: ${label}`,
        `"${label}" was installed and your server was switched to the matching Minecraft version and loader. Start it when ready.`,
      );
      this.logger.log(`modpack install complete for ${serverId} (${label})`);
    } catch (err) {
      const message = (err as Error).message ?? 'unknown error';
      this.logger.error(`modpack install failed for ${serverId}: ${message}`);
      await this.prisma.server
        .update({ where: { id: serverId }, data: { state: 'CRASHED' } })
        .catch(() => undefined);
      await this.notify(
        serverId,
        `Modpack install failed: ${label}`,
        `Installing "${label}" failed: ${message}. Your server was not changed beyond any loader switch already applied.`,
      );
    }
  }

  private async processServerPack(
    job: Job<ServerPackInstallJob>,
  ): Promise<void> {
    const { serverId } = job.data;
    const label = job.data.title || 'server pack';
    try {
      await this.installServerPack(job.data);
      await this.prisma.server.update({
        where: { id: serverId },
        data: { state: 'OFFLINE' },
      });
      await this.notify(
        serverId,
        `Server pack installed: ${label}`,
        `"${label}" was extracted and your server was switched to ${job.data.loader}. Client-only mods were removed. Start it when ready.`,
      );
      this.logger.log(`server-pack install complete for ${serverId} (${label})`);
    } catch (err) {
      const message = (err as Error).message ?? 'unknown error';
      this.logger.error(`server-pack install failed for ${serverId}: ${message}`);
      await this.prisma.server
        .update({ where: { id: serverId }, data: { state: 'CRASHED' } })
        .catch(() => undefined);
      await this.notify(
        serverId,
        `Server pack install failed: ${label}`,
        `Installing "${label}" failed: ${message}.`,
      );
    }
  }

  private async processUninstall(job: Job<ModpackUninstallJob>): Promise<void> {
    const { serverId, title } = job.data;
    const label = title || 'modpack';
    try {
      await this.uninstall(serverId);
      await this.prisma.server.update({
        where: { id: serverId },
        data: { state: 'OFFLINE' },
      });
      await this.notify(
        serverId,
        `Modpack uninstalled: ${label}`,
        `"${label}" was removed — its mods were cleared. Your world and the current loader/version are unchanged; switch the loader from the Minecraft tab if you want a clean vanilla server.`,
      );
      this.logger.log(`modpack uninstall complete for ${serverId}`);
    } catch (err) {
      const message = (err as Error).message ?? 'unknown error';
      this.logger.error(`modpack uninstall failed for ${serverId}: ${message}`);
      await this.prisma.server
        .update({ where: { id: serverId }, data: { state: 'OFFLINE' } })
        .catch(() => undefined);
      await this.notify(
        serverId,
        `Modpack uninstall failed: ${label}`,
        `Removing "${label}" failed: ${message}.`,
      );
    }
  }

  private async install(serverId: string, versionId: string): Promise<void> {
    // 1. Resolve the modpack version + its .mrpack file.
    const version = await this.modrinth.version(versionId);
    const file =
      version.files.find((f) => f.filename.endsWith('.mrpack')) ??
      this.modrinth.pickFile(version);
    if (!file) throw new Error('Modpack version has no downloadable file');

    const packBytes = await this.download(file.url, MRPACK_MAX_BYTES);
    // Only decompress what we actually apply server-side: the index and the
    // shared/server overrides. Skipping client-overrides/ (often a large resource
    // pack) keeps memory down for big packs.
    const entries = unzipSync(packBytes, {
      filter: (f) =>
        f.name === 'modrinth.index.json' ||
        f.name.startsWith('overrides/') ||
        f.name.startsWith('server-overrides/'),
    });
    const indexRaw = entries['modrinth.index.json'];
    if (!indexRaw) throw new Error('Invalid .mrpack: missing modrinth.index.json');
    const index = JSON.parse(
      Buffer.from(indexRaw).toString('utf8'),
    ) as MrpackIndex;

    // 2. Derive loader + versions from the pack dependencies.
    const deps = index.dependencies ?? {};
    const gameVersion = deps['minecraft'];
    if (!gameVersion) throw new Error('Modpack does not specify a Minecraft version');
    const { loader, loaderVersion } = this.resolveLoader(deps);

    // 3. Apply the loader/version to the server (no reinstall yet).
    await this.servers.applyMinecraftEnv(serverId, {
      loader,
      version: gameVersion,
      loaderVersion,
    });

    // 4. Reinstall to provision the new loader/version, preserving worlds.
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      include: {
        node: true,
        template: { include: { variables: true } },
        allocations: true,
        variables: true,
      },
    });
    if (!server || !server.template) throw new Error('Server missing template');
    const sftpPassword = server.sftpPasswordEnc
      ? this.crypto.decrypt(server.sftpPasswordEnc)
      : undefined;
    await this.agent.reinstall(
      server.node,
      buildInstallSpec(server, { wipe: false, sftpPassword }),
    );

    // 5. Clean pack-managed content so nothing from a previous pack or loader can
    //    linger. A leftover/duplicate/version-skewed mod jar (or a stale worldgen
    //    datapack) still ships a structure_set that references structures the new
    //    jar set no longer defines, which fails the whole registry load at boot
    //    ("Unbound values in registry worldgen/structure"). Aborts if the wipe
    //    itself fails — layering new jars over a partial wipe is what creates the
    //    dirty union.
    await this.clearPackContent(server.node, server.id);

    // 6. Download every server-required mod (with retries), and record exactly
    //    which files must land so a partial install can't masquerade as success.
    const createdDirs = new Set<string>();
    const { installed, clientOnly, missing } = await this.downloadServerFiles(
      server.node,
      server.id,
      index,
    );

    // 6b. Completeness gate: refuse to finish a half-installed pack. A modpack
    //     missing server-required files WILL crash on boot with dangling registry
    //     references, so fail loudly (state -> CRASHED via the caller, no success
    //     marker) with the list instead of reporting success.
    if (missing.length) {
      const sample = missing.slice(0, 8).join(', ');
      throw new Error(
        `Incomplete install: ${missing.length} required file(s) could not be downloaded ` +
          `(${sample}${missing.length > 8 ? ', …' : ''}). Nothing was marked installed — retry the install.`,
      );
    }

    // 7. Apply config overrides bundled in the .mrpack (server + shared, not client).
    for (const [name, bytes] of Object.entries(entries)) {
      if (name.endsWith('/')) continue; // directory entry
      let rel: string | null = null;
      if (name.startsWith('overrides/')) rel = name.slice('overrides/'.length);
      else if (name.startsWith('server-overrides/'))
        rel = name.slice('server-overrides/'.length);
      if (!rel) continue; // skip client-overrides/ and metadata
      // Overrides come from inside the .mrpack (already in memory), so they go
      // through the signed upload and are bounded by its cap. Server-side
      // overrides are normally small configs; warn if one is too big to apply.
      if (bytes.byteLength > AGENT_MAX_UPLOAD_BYTES) {
        this.logger.warn(
          `skipping oversized override ${rel} (${bytes.byteLength} bytes)`,
        );
        continue;
      }
      try {
        await this.writeFile(server.node, server.id, rel, bytes, createdDirs);
      } catch (e) {
        this.logger.warn(`failed to apply override ${rel}: ${String(e)}`);
      }
    }

    // 7a. Strip well-known client-only mods. Fabric self-skips them, but on
    //     Forge/NeoForge they crash the dedicated server on boot ("clientside
    //     only mod … refusing"). Packs that bundle them as overrides or don't
    //     flag env.server=unsupported would otherwise leave them on the server.
    const stripped = await this.stripClientOnlyMods(server.node, server.id);

    // 7b. Belt-and-suspenders: warn (don't fail) if two jars for the same mod at
    //     different versions ended up in mods/ — a pack-index quirk; the
    //     pre-install wipe already prevents leftover duplicates from a prior pack.
    const duplicates = await this.warnOnDuplicateJars(server.node, server.id);

    // 8. Record what's installed so the Modpacks tab can show it + offer removal.
    const marker = {
      projectId: version.projectId,
      versionId: version.id,
      title: version.name,
      versionNumber: version.versionNumber,
      mcVersion: gameVersion,
      loader,
      loaderVersion,
      filesInstalled: installed,
      installedAt: new Date().toISOString(),
    };
    await this.writeFile(
      server.node,
      server.id,
      MODPACK_MARKER,
      new TextEncoder().encode(JSON.stringify(marker, null, 2)),
      createdDirs,
    ).catch((e) =>
      this.logger.warn(`failed to write modpack marker: ${String(e)}`),
    );

    this.logger.log(
      `modpack ${serverId}: ${installed} files installed, ${clientOnly} client-only skipped` +
        (stripped.length ? `, ${stripped.length} client-only jar(s) stripped` : '') +
        (duplicates.length
          ? `, possible duplicates: ${duplicates.join(', ')}`
          : ''),
    );
  }

  /**
   * Install a modpack from a server-pack .zip the user already uploaded (via
   * SFTP or the file manager). We EXTRACT first, auto-detect the loader/version
   * from the pack (manifest.json / mmc-pack.json / on-disk markers) unless the
   * caller specified them, then provision that loader with our own egg (so the
   * startup command + JVM are known-good), strip client-only mods, remove the zip.
   */
  private async installServerPack(job: ServerPackInstallJob): Promise<void> {
    const { serverId, zipPath } = job;

    // 1. Confirm the uploaded zip is actually there before we touch anything.
    const clean = zipPath.replace(/^\/+/, '');
    const slash = clean.lastIndexOf('/');
    const dir = slash > 0 ? clean.slice(0, slash) : '';
    const base = clean.slice(slash + 1);
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      include: {
        node: true,
        template: { include: { variables: true } },
        allocations: true,
        variables: true,
      },
    });
    if (!server || !server.template) throw new Error('Server missing template');
    const node = server.node;
    const listing = await this.agent
      .listFiles(node, server.id, dir || '/')
      .catch(() => [] as { name: string }[]);
    if (!listing.some((e) => e.name === base)) {
      throw new Error(
        `Server-pack zip not found at "${zipPath}". Upload it to the server first (SFTP for large packs), then install.`,
      );
    }

    // 2. Clear stale content, then extract the pack over the top (the zip is at
    //    the root, not in mods/, so clearing mods/ leaves it in place).
    await this.clearPackContent(node, server.id);
    const before = new Set(
      (await this.agent.listFiles(node, server.id, '/').catch(() => [])).map(
        (e) => e.name,
      ),
    );
    await this.agent.decompressFile(node, server.id, zipPath, '.');

    // 3. Flatten a single wrapper folder so mods/ + the manifest land at the root.
    await this.flattenServerPack(node, server.id, before);

    // 4. Resolve loader/version: caller-supplied wins, else auto-detect from the
    //    extracted pack. Bail with a clear message if we still can't tell.
    const detected = await this.detectPackMeta(node, server.id);
    const loader = job.loader || detected.loader;
    const version = job.version || detected.version;
    const loaderVersion = job.loaderVersion || detected.loaderVersion;
    if (!loader) {
      throw new Error(
        'Could not auto-detect the mod loader from the pack. Re-run and pick the loader (and Minecraft version) manually.',
      );
    }

    // 5. Provision the loader over the extracted files (wipe:false keeps them).
    await this.servers.applyMinecraftEnv(serverId, {
      loader,
      version,
      loaderVersion,
    });
    const provisioned = await this.prisma.server.findUnique({
      where: { id: serverId },
      include: {
        node: true,
        template: { include: { variables: true } },
        allocations: true,
        variables: true,
      },
    });
    if (!provisioned || !provisioned.template) {
      throw new Error('Server missing template');
    }
    const sftpPassword = provisioned.sftpPasswordEnc
      ? this.crypto.decrypt(provisioned.sftpPasswordEnc)
      : undefined;
    await this.agent.reinstall(
      provisioned.node,
      buildInstallSpec(provisioned, { wipe: false, sftpPassword }),
    );

    // 6. Strip client-only mods (Forge/NeoForge would crash on them), remove zip.
    const stripped = await this.stripClientOnlyMods(node, server.id);
    await this.agent
      .deleteFiles(node, server.id, [zipPath])
      .catch(() => undefined);

    // 7. Marker so the Modpacks tab shows what's installed.
    const marker = {
      title: job.title || base.replace(/\.zip$/i, ''),
      source: 'server-pack',
      mcVersion: version ?? 'latest',
      loader,
      loaderVersion: loaderVersion ?? 'latest',
      installedAt: new Date().toISOString(),
    };
    await this.writeFile(
      node,
      server.id,
      MODPACK_MARKER,
      new TextEncoder().encode(JSON.stringify(marker, null, 2)),
      new Set<string>(),
    ).catch((e) => this.logger.warn(`failed to write marker: ${String(e)}`));

    this.logger.log(
      `server-pack ${serverId}: extracted ${base}, loader ${loader} ${version ?? ''}` +
        (stripped.length ? `, ${stripped.length} client-only jar(s) stripped` : ''),
    );
  }

  /**
   * Detect a server pack's loader + Minecraft/loader version from files it left
   * on disk after extraction: CurseForge `manifest.json`, Prism/MultiMC
   * `mmc-pack.json`, or the forge/neoforge libraries + fabric launcher markers.
   * Any field may be absent; caller supplies fallbacks.
   */
  private async detectPackMeta(
    node: any,
    serverId: string,
  ): Promise<{ loader?: string; version?: string; loaderVersion?: string }> {
    // 1. CurseForge manifest.json
    const manifest = await this.readJson(node, serverId, 'manifest.json');
    if (manifest?.minecraft) {
      const version: string | undefined = manifest.minecraft.version;
      const loaders: Array<{ id?: string; primary?: boolean }> =
        manifest.minecraft.modLoaders ?? [];
      const ml = loaders.find((m) => m.primary) ?? loaders[0];
      if (ml?.id) {
        const idx = ml.id.indexOf('-');
        const fam = idx >= 0 ? ml.id.slice(0, idx) : ml.id;
        const lv = idx >= 0 ? ml.id.slice(idx + 1) : undefined;
        const loader = this.normalizeLoaderFamily(fam);
        if (loader) return { loader, version, loaderVersion: lv || undefined };
      }
      if (version) return { version };
    }

    // 2. Prism / MultiMC mmc-pack.json
    const mmc = await this.readJson(node, serverId, 'mmc-pack.json');
    if (Array.isArray(mmc?.components)) {
      const comp = (uid: string): string | undefined =>
        mmc.components.find((c: { uid?: string }) => c.uid === uid)?.version;
      const version = comp('net.minecraft');
      if (comp('net.neoforged'))
        return { loader: 'neoforge', version, loaderVersion: comp('net.neoforged') };
      if (comp('net.minecraftforge'))
        return { loader: 'forge', version, loaderVersion: comp('net.minecraftforge') };
      if (comp('net.fabricmc.fabric-loader'))
        return {
          loader: 'fabric',
          version,
          loaderVersion: comp('net.fabricmc.fabric-loader'),
        };
      if (version) return { version };
    }

    // 3. On-disk markers left by the loader's own installer.
    const root = await this.agent
      .listFiles(node, serverId, '/')
      .catch(() => [] as { name: string; isDir?: boolean }[]);
    const forgeDir = (
      await this.agent
        .listFiles(node, serverId, 'libraries/net/minecraftforge/forge')
        .catch(() => [] as { name: string; isDir?: boolean }[])
    ).find((e) => e.isDir);
    if (forgeDir) {
      const [mc, fv] = forgeDir.name.split('-');
      return { loader: 'forge', version: mc, loaderVersion: fv };
    }
    const neoDir = (
      await this.agent
        .listFiles(node, serverId, 'libraries/net/neoforged/neoforge')
        .catch(() => [] as { name: string; isDir?: boolean }[])
    ).find((e) => e.isDir);
    if (neoDir) return { loader: 'neoforge', loaderVersion: neoDir.name };
    if (root.some((e) => !e.isDir && e.name === 'fabric-server-launch.jar')) {
      return { loader: 'fabric' };
    }
    return {};
  }

  /** Read + parse a JSON file from the server, or null on any failure. */
  private async readJson(
    node: any,
    serverId: string,
    path: string,
  ): Promise<any | null> {
    try {
      const res = await this.agent.readFile(node, serverId, path);
      const raw =
        typeof res === 'string' ? res : ((res as { content?: string })?.content ?? '');
      return raw.trim() ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /** Map a loader-family token (forge/neoforge/fabric/quilt) to a supported loader. */
  private normalizeLoaderFamily(fam: string): string | undefined {
    const f = fam.toLowerCase();
    if (f === 'forge') return 'forge';
    if (f === 'neoforge') return 'neoforge';
    if (f === 'fabric' || f === 'quilt') return 'fabric';
    return undefined;
  }

  /**
   * If a server-pack zip extracted its contents into a single top-level wrapper
   * folder (no mods/ at the server root), move that folder's children up to the
   * root. `before` is the set of root entry names captured just before extraction.
   */
  private async flattenServerPack(
    node: any,
    serverId: string,
    before: Set<string>,
  ): Promise<void> {
    const root = await this.agent
      .listFiles(node, serverId, '/')
      .catch(() => [] as { name: string; isDir?: boolean }[]);
    if (root.some((e) => e.isDir && e.name === 'mods')) return; // already at root
    const newDirs = root.filter((e) => e.isDir && !before.has(e.name));
    for (const d of newDirs) {
      const inner = await this.agent
        .listFiles(node, serverId, d.name)
        .catch(() => [] as { name: string; isDir?: boolean }[]);
      if (!inner.some((e) => e.isDir && e.name === 'mods')) continue;
      for (const child of inner) {
        await this.agent
          .renameFile(node, serverId, `${d.name}/${child.name}`, child.name)
          .catch(() => undefined);
      }
      await this.agent
        .deleteFiles(node, serverId, [d.name])
        .catch(() => undefined);
      return;
    }
  }

  /**
   * Uninstall the current modpack: clear the mods folder and remove the marker.
   * The world and the chosen loader/version are left intact (the customer can
   * switch back to vanilla from the Minecraft tab if they want a clean server).
   */
  private async uninstall(serverId: string): Promise<void> {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      include: { node: true },
    });
    if (!server) throw new Error('Server not found');
    await this.wipeModsDir(server.node, server.id);
    await this.agent
      .deleteFiles(server.node, server.id, [MODPACK_MARKER])
      .catch(() => undefined);
  }

  // ---- helpers ------------------------------------------------------------

  private resolveLoader(deps: Record<string, string>): {
    loader: string;
    loaderVersion: string;
  } {
    if (deps['fabric-loader'])
      return { loader: 'fabric', loaderVersion: deps['fabric-loader'] };
    if (deps['neoforge'])
      return { loader: 'neoforge', loaderVersion: deps['neoforge'] };
    if (deps['forge']) return { loader: 'forge', loaderVersion: deps['forge'] };
    if (deps['quilt-loader']) {
      throw new Error('Quilt modpacks are not supported yet');
    }
    // No loader dependency → vanilla pack (datapacks/config only).
    return { loader: 'vanilla', loaderVersion: 'latest' };
  }

  /**
   * Download every server-required file in the index, with retries. Returns the
   * count installed, the count of legitimately-skipped client-only files, and
   * the list of server-required files that could NOT be delivered (no usable
   * Modrinth URL, too big, or failed after retries) — the caller fails the job
   * if that list is non-empty.
   */
  private async downloadServerFiles(
    node: any,
    serverId: string,
    index: MrpackIndex,
  ): Promise<{ installed: number; clientOnly: number; missing: string[] }> {
    const missing: string[] = [];
    let installed = 0;
    let clientOnly = 0;
    for (const f of index.files ?? []) {
      // Client-only files (env.server === 'unsupported') are legitimately skipped.
      if (f.env?.server === 'unsupported') {
        clientOnly++;
        continue;
      }
      const url = f.downloads?.[0];
      // A server-required file we can't fetch (no url / non-Modrinth host / too
      // big) is a hard MISS, not a silent skip — its absence is exactly what
      // dangles a structure reference at boot.
      if (!url || !this.isModrinthHost(url)) {
        this.logger.warn(
          `cannot fetch required file ${f.path} (no usable Modrinth URL)`,
        );
        missing.push(f.path);
        continue;
      }
      if (f.fileSize && f.fileSize > MAX_MOD_BYTES) {
        this.logger.warn(
          `required file ${f.path} exceeds the size cap (${f.fileSize} bytes)`,
        );
        missing.push(f.path);
        continue;
      }
      try {
        await this.withRetry(
          () => this.agent.downloadToPath(node, serverId, f.path, url),
          3,
          f.path,
        );
        installed++;
      } catch (e) {
        this.logger.warn(`failed to install ${f.path}: ${String(e)}`);
        missing.push(f.path);
      }
    }
    return { installed, clientOnly, missing };
  }

  /**
   * Remove well-known client-only mod jars from mods/. Returns the filenames
   * stripped. On Forge/NeoForge these crash a dedicated server on boot; Fabric
   * ignores them, so stripping is safe on every loader. Best-effort: matches a
   * curated slug denylist against the normalized filename.
   */
  private async stripClientOnlyMods(
    node: any,
    serverId: string,
  ): Promise<string[]> {
    let entries;
    try {
      entries = await this.agent.listFiles(node, serverId, 'mods');
    } catch {
      return [];
    }
    const toRemove: string[] = [];
    for (const e of entries ?? []) {
      if (e.isDir || !e.name.toLowerCase().endsWith('.jar')) continue;
      const norm = e.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (CLIENT_ONLY_MOD_SLUGS.some((slug) => norm.includes(slug))) {
        toRemove.push(`mods/${e.name}`);
      }
    }
    if (toRemove.length) {
      this.logger.warn(
        `stripping ${toRemove.length} client-only mod(s) so the server can boot: ${toRemove.join(', ')}`,
      );
      // Best-effort: a failed strip shouldn't abort a completed install.
      await this.agent
        .deleteFiles(node, serverId, toRemove)
        .catch((e) => this.logger.warn(`failed to strip client mods: ${String(e)}`));
    }
    return toRemove;
  }

  /**
   * Wipe EVERYTHING under mods/ (nested folders, *.jar, *.jar.disabled), so no
   * jar from a previous pack or loader — including a version-skewed duplicate —
   * can linger. The agent deletes recursively (os.RemoveAll). Throws if the wipe
   * fails: layering a new pack over a half-cleared mods/ is what dangles a stale
   * structure_set against absent structures. No-op if mods/ doesn't exist yet.
   */
  private async wipeModsDir(node: any, serverId: string): Promise<void> {
    let entries;
    try {
      entries = await this.agent.listFiles(node, serverId, 'mods');
    } catch {
      return; // mods/ not created yet — nothing to clear
    }
    const paths = (entries ?? []).map((e) => `mods/${e.name}`);
    if (paths.length) await this.agent.deleteFiles(node, serverId, paths);
  }

  /**
   * Clean all pack-managed content before applying a new pack: wipe mods/ and
   * remove leftover global worldgen datapacks (the pack re-adds its own via
   * overrides). config/ is intentionally left in place — a pack ships its own
   * config via overrides, and wiping it would discard user customization.
   */
  private async clearPackContent(node: any, serverId: string): Promise<void> {
    await this.wipeModsDir(node, serverId);
    // Best-effort: leftover datapacks that could reference a now-absent mod's
    // structures. Deleting a missing path is harmless.
    await this.agent
      .deleteFiles(node, serverId, ['datapacks', 'world/datapacks'])
      .catch(() => undefined);
  }

  /**
   * Run `fn` with up to `attempts` tries and exponential backoff — smooths over
   * Modrinth rate-limiting when a big pack bulk-downloads hundreds of mods.
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    attempts: number,
    label: string,
  ): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        if (i < attempts - 1) {
          this.logger.warn(
            `retry ${i + 1}/${attempts - 1} for ${label}: ${String(e)}`,
          );
          await this.sleep(500 * 2 ** i);
        }
      }
    }
    throw lastErr;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Return jar filenames in mods/ that look like the SAME mod at different
   * versions (a boot-crash risk). Best-effort, warn-only — the pre-install wipe
   * already prevents leftover duplicates, so this only catches a pack-index quirk.
   */
  private async warnOnDuplicateJars(
    node: any,
    serverId: string,
  ): Promise<string[]> {
    let entries;
    try {
      entries = await this.agent.listFiles(node, serverId, 'mods');
    } catch {
      return [];
    }
    const byKey = new Map<string, string[]>();
    for (const e of entries ?? []) {
      if (e.isDir || !e.name.toLowerCase().endsWith('.jar')) continue;
      const key = this.modKey(e.name);
      if (!key) continue;
      const arr = byKey.get(key) ?? [];
      arr.push(e.name);
      byKey.set(key, arr);
    }
    const dups = [...byKey.values()].filter((v) => v.length > 1).flat();
    if (dups.length) {
      this.logger.warn(
        `mods/ has possible same-mod duplicates (different versions): ${dups.join(', ')}`,
      );
    }
    return dups;
  }

  /**
   * Collapse a jar filename to a rough mod key by stripping version + loader/mc
   * tags, so two builds of one mod map to the same key.
   */
  private modKey(filename: string): string {
    return filename
      .replace(/\.jar$/i, '')
      .toLowerCase()
      .replace(/[-_+ ]v?\d[\w.]*/g, ' ')
      .replace(/\b(fabric|forge|neoforge|quilt|mc)\b/g, ' ')
      .replace(/[^a-z]+/g, '');
  }

  /** Write a file, best-effort creating its parent directory first (deduped). */
  private async writeFile(
    node: any,
    serverId: string,
    relPath: string,
    bytes: Uint8Array,
    createdDirs: Set<string>,
  ): Promise<void> {
    const clean = relPath.replace(/^\/+/, '');
    if (clean.includes('..')) throw new Error(`unsafe path ${relPath}`);
    const slash = clean.lastIndexOf('/');
    if (slash > 0) {
      const dir = clean.slice(0, slash);
      if (!createdDirs.has(dir)) {
        await this.agent.mkdir(node, serverId, dir).catch(() => undefined);
        createdDirs.add(dir);
      }
    }
    await this.agent.uploadFileBytes(node, serverId, clean, bytes);
  }

  private isModrinthHost(url: string): boolean {
    try {
      const host = new URL(url).host;
      return /(^|\.)modrinth\.com$/.test(host) || /(^|\.)modrinth\.dev$/.test(host);
    } catch {
      return false;
    }
  }

  private async download(url: string, maxBytes: number): Promise<Uint8Array> {
    if (!this.isModrinthHost(url)) {
      throw new Error('Refusing to download from a non-Modrinth host');
    }
    const controller = new AbortController();
    // Only the .mrpack itself comes through here now (mods are pulled agent-side),
    // and it can be a few hundred MiB — allow a generous window.
    const timer = setTimeout(() => controller.abort(), 5 * 60_000);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      const len = Number(res.headers.get('content-length') ?? 0);
      if (len && len > maxBytes) throw new Error('file exceeds size limit');
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > maxBytes) throw new Error('file exceeds size limit');
      return buf;
    } finally {
      clearTimeout(timer);
    }
  }

  private async notify(
    serverId: string,
    title: string,
    body: string,
  ): Promise<void> {
    const server = await this.prisma.server
      .findUnique({ where: { id: serverId }, select: { ownerId: true } })
      .catch(() => null);
    if (!server?.ownerId) return;
    await this.prisma.notification
      .create({
        data: { id: uuidv7(), userId: server.ownerId, channel: 'IN_APP', title, body },
      })
      .catch(() => undefined);
  }
}
