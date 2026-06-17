import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WorkshopKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { uuidv7 } from '../common/util/uuid';
import { JOB, QUEUE, ReinstallJob } from '../queues/queue.constants';

/**
 * Steam Workshop management for a server: add/remove/reorder Workshop items and
 * collections, then "apply" them — which writes the standard WORKSHOP_* server
 * variables (consumed by the egg's startup/install) and reinstalls so steamcmd
 * fetches downloaded content and the new startup args take effect.
 *
 * Mods are downloaded by the host game-download account (Admin → Settings →
 * Steam); customers never supply Steam credentials. Collection/item metadata is
 * resolved best-effort from Steam's public Web API; lookups never block adding.
 */
@Injectable()
export class WorkshopService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE.REINSTALL) private readonly reinstallQueue: Queue<ReinstallJob>,
  ) {}

  private async loadServer(serverId: string) {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      include: { template: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    if (!server.template?.supportsWorkshop) {
      throw new BadRequestException(
        'This game does not support Steam Workshop content.',
      );
    }
    return server;
  }

  list(serverId: string) {
    return this.prisma.workshopMod.findMany({
      where: { serverId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Pull a numeric published-file id out of a raw id or a Steam Workshop URL. */
  private static parseId(input: string): string | null {
    const trimmed = input.trim();
    if (/^\d+$/.test(trimmed)) return trimmed;
    const m = trimmed.match(/[?&]id=(\d+)/) || trimmed.match(/(\d{6,})/);
    return m ? m[1] : null;
  }

  /**
   * Whether the egg loads a Workshop *collection* at runtime (e.g. Garry's Mod's
   * `+host_workshop_collection {{WORKSHOP_ID}}`) vs. downloading individual items
   * with steamcmd (Arma 3, DayZ). For the former we keep a single COLLECTION row;
   * for the latter we expand collections into their member items.
   */
  private static usesRuntimeCollection(tpl: {
    startupCommand?: string | null;
    installScript?: unknown;
  }): boolean {
    const hay =
      (tpl.startupCommand ?? '') + JSON.stringify(tpl.installScript ?? '');
    return /host_workshop_collection|WORKSHOP_ID/i.test(hay);
  }

  async add(serverId: string, input: string): Promise<{ added: number }> {
    const server = await this.loadServer(serverId);
    const workshopId = WorkshopService.parseId(input);
    if (!workshopId) {
      throw new BadRequestException('Enter a Workshop ID or URL');
    }

    // Item-download games (Arma 3, DayZ): expand a collection into its member
    // items so each mod is downloaded + loaded individually. Plain items and
    // runtime-collection games (GMod) fall through to the single-row path.
    if (!WorkshopService.usesRuntimeCollection(server.template!)) {
      const itemIds = await this.expandCollection(workshopId);
      if (itemIds.length) {
        return { added: await this.addItems(serverId, itemIds) };
      }
    }

    const existing = await this.prisma.workshopMod.findUnique({
      where: { serverId_workshopId: { serverId, workshopId } },
    });
    if (existing) return { added: 0 };

    const meta = await this.resolve(workshopId);
    const count = await this.prisma.workshopMod.count({ where: { serverId } });
    await this.prisma.workshopMod.create({
      data: {
        id: uuidv7(),
        serverId,
        workshopId,
        name: meta.name,
        kind: meta.kind,
        enabled: true,
        sortOrder: count,
      },
    });
    return { added: 1 };
  }

  /** Create ITEM rows for the given ids (skipping ones already present). */
  private async addItems(serverId: string, ids: string[]): Promise<number> {
    const existing = await this.prisma.workshopMod.findMany({
      where: { serverId },
      select: { workshopId: true },
    });
    const have = new Set(existing.map((e) => e.workshopId));
    const toAdd = ids.filter((id) => !have.has(id));
    if (!toAdd.length) return 0;

    const titles = await this.itemTitles(toAdd);
    let sortOrder = await this.prisma.workshopMod.count({ where: { serverId } });
    await this.prisma.workshopMod.createMany({
      data: toAdd.map((id) => ({
        id: uuidv7(),
        serverId,
        workshopId: id,
        name: titles[id] ?? null,
        kind: 'ITEM' as WorkshopKind,
        enabled: true,
        sortOrder: sortOrder++,
      })),
      skipDuplicates: true,
    });
    return toAdd.length;
  }

  async remove(serverId: string, id: string) {
    await this.prisma.workshopMod.deleteMany({ where: { id, serverId } });
  }

  async toggle(serverId: string, id: string, enabled: boolean) {
    const mod = await this.prisma.workshopMod.findFirst({ where: { id, serverId } });
    if (!mod) throw new NotFoundException('Workshop item not found');
    return this.prisma.workshopMod.update({ where: { id }, data: { enabled } });
  }

  /** Persist a new order (array of WorkshopMod ids, first = top). */
  async reorder(serverId: string, ids: string[]) {
    const owned = await this.prisma.workshopMod.findMany({
      where: { serverId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((o) => o.id));
    await this.prisma.$transaction(
      ids
        .filter((id) => ownedIds.has(id))
        .map((id, i) =>
          this.prisma.workshopMod.update({ where: { id }, data: { sortOrder: i } }),
        ),
    );
    return this.list(serverId);
  }

  /**
   * Apply the enabled Workshop content: write the WORKSHOP_* server variables the
   * egg consumes, then reinstall (preserving data) so steamcmd downloads run and
   * the new startup args take effect.
   */
  async apply(serverId: string): Promise<{ accepted: true }> {
    await this.loadServer(serverId);

    const mods = await this.prisma.workshopMod.findMany({
      where: { serverId, enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const items = mods.filter((m) => m.kind === 'ITEM').map((m) => m.workshopId);
    const collections = mods
      .filter((m) => m.kind === 'COLLECTION')
      .map((m) => m.workshopId);

    // Standard variables the eggs reference (e.g. GMod's {{WORKSHOP_ID}} and a
    // steamcmd download loop over {{WORKSHOP_ITEMS}}). WORKSHOP_ID is only set
    // when a collection is selected so we never blank out a runtime-collection
    // game's startup (which would break `+host_workshop_collection`).
    const vars: Record<string, string> = {
      WORKSHOP_ITEMS: items.join(' '),
      WORKSHOP_COLLECTIONS: collections.join(' '),
      ...(collections[0] ? { WORKSHOP_ID: collections[0] } : {}),
    };
    for (const [envName, value] of Object.entries(vars)) {
      await this.prisma.serverVariable.upsert({
        where: { serverId_envName: { serverId, envName } },
        create: { id: uuidv7(), serverId, envName, value },
        update: { value },
      });
    }

    await this.prisma.server.update({
      where: { id: serverId },
      data: { state: 'REINSTALLING' },
    });
    await this.reinstallQueue.add(JOB.REINSTALL, {
      serverId,
      preserveData: true,
      // Fetch only the Workshop content — don't re-validate the whole base game.
      workshopSync: true,
    } satisfies ReinstallJob);
    return { accepted: true };
  }

  // ---- Steam Web API (public endpoints; best-effort) ---------------------

  private static readonly STEAM_API = 'https://api.steampowered.com';

  /** Resolve an id's display name + whether it's a collection. Never throws. */
  private async resolve(
    workshopId: string,
  ): Promise<{ name: string | null; kind: WorkshopKind }> {
    const children = await this.collectionChildren(workshopId);
    return {
      name: await this.itemTitle(workshopId),
      kind: children.length ? 'COLLECTION' : 'ITEM',
    };
  }

  /** A collection's direct children (id + filetype). Empty if not a collection. */
  private async collectionChildren(
    workshopId: string,
  ): Promise<Array<{ id: string; filetype: number }>> {
    try {
      const res = await fetch(
        `${WorkshopService.STEAM_API}/ISteamRemoteStorage/GetCollectionDetails/v1/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            collectioncount: '1',
            'publishedfileids[0]': workshopId,
          }),
          signal: AbortSignal.timeout(6000),
        },
      );
      if (!res.ok) return [];
      const data = (await res.json()) as {
        response?: {
          collectiondetails?: Array<{
            result?: number;
            children?: Array<{ publishedfileid?: string; filetype?: number }>;
          }>;
        };
      };
      const det = data.response?.collectiondetails?.[0];
      if (det?.result !== 1 || !Array.isArray(det.children)) return [];
      return det.children
        .map((c) => ({ id: String(c.publishedfileid ?? ''), filetype: Number(c.filetype ?? 0) }))
        .filter((c) => /^\d+$/.test(c.id));
    } catch {
      return [];
    }
  }

  /**
   * Expand a collection into the flat set of member item ids, descending into
   * nested sub-collections (filetype 2). Returns [] for a plain item. Bounded by
   * a lookup budget so a pathological/cyclic collection can't run away.
   */
  private async expandCollection(rootId: string): Promise<string[]> {
    const items = new Set<string>();
    const visited = new Set<string>();
    const stack = [rootId];
    let budget = 25; // max collection lookups (root + nested)
    while (stack.length && budget-- > 0) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const children = await this.collectionChildren(id);
      for (const c of children) {
        if (c.filetype === 2) {
          if (!visited.has(c.id)) stack.push(c.id); // nested collection
        } else {
          items.add(c.id);
        }
      }
    }
    return [...items];
  }

  /** Best-effort published-file titles for many ids in one call ({} on failure). */
  private async itemTitles(ids: string[]): Promise<Record<string, string>> {
    if (!ids.length) return {};
    try {
      const body = new URLSearchParams({ itemcount: String(ids.length) });
      ids.forEach((id, i) => body.set(`publishedfileids[${i}]`, id));
      const res = await fetch(
        `${WorkshopService.STEAM_API}/ISteamRemoteStorage/GetPublishedFileDetails/v1/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!res.ok) return {};
      const data = (await res.json()) as {
        response?: { publishedfiledetails?: Array<{ publishedfileid?: string; title?: string }> };
      };
      const out: Record<string, string> = {};
      for (const d of data.response?.publishedfiledetails ?? []) {
        if (d.publishedfileid && d.title) out[String(d.publishedfileid)] = d.title;
      }
      return out;
    } catch {
      return {};
    }
  }

  /** Best-effort published-file title (null if unavailable). */
  private async itemTitle(workshopId: string): Promise<string | null> {
    try {
      const res = await fetch(
        `${WorkshopService.STEAM_API}/ISteamRemoteStorage/GetPublishedFileDetails/v1/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            itemcount: '1',
            'publishedfileids[0]': workshopId,
          }),
          signal: AbortSignal.timeout(6000),
        },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        response?: { publishedfiledetails?: Array<{ title?: string }> };
      };
      return data.response?.publishedfiledetails?.[0]?.title || null;
    } catch {
      return null;
    }
  }
}
