import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WorkshopKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { uuidv7 } from '../common/util/uuid';
import { JOB, QUEUE, ReinstallJob } from '../queues/queue.constants';

/**
 * Steam Workshop management for a server: add/remove/reorder Workshop items and
 * collections, then "apply" them — which writes the standard WORKSHOP_* server
 * variables (consumed by the egg's startup/install) and reinstalls so steamcmd
 * fetches downloaded content and the new startup args take effect.
 *
 * Collection/item metadata (name + whether an id is a collection) is resolved
 * best-effort from Steam's public Web API; lookups never block adding an id.
 */
@Injectable()
export class WorkshopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    @InjectQueue(QUEUE.REINSTALL) private readonly reinstallQueue: Queue<ReinstallJob>,
  ) {}

  // ---- Per-server Steam login (customer-owned) ---------------------------

  /** Masked Steam-login status for the Workshop tab — never returns the password. */
  async steamStatus(serverId: string): Promise<{ username: string; hasLogin: boolean }> {
    const server = await this.loadServer(serverId);
    return {
      username: server.steamUsername ?? '',
      hasLogin: !!(server.steamUsername && server.steamPasswordEnc),
    };
  }

  /** Set the customer's own Steam login for this server (password encrypted). */
  async setSteamLogin(
    serverId: string,
    dto: { username: string; password: string },
  ): Promise<{ username: string; hasLogin: boolean }> {
    await this.loadServer(serverId);
    const username = dto.username.trim();
    if (!username || !dto.password) {
      throw new BadRequestException('Enter your Steam username and password');
    }
    await this.prisma.server.update({
      where: { id: serverId },
      data: {
        steamUsername: username,
        steamPasswordEnc: this.crypto.encrypt(dto.password),
      },
    });
    return { username, hasLogin: true };
  }

  /** Remove the customer's stored Steam login for this server. */
  async clearSteamLogin(serverId: string): Promise<void> {
    await this.loadServer(serverId);
    await this.prisma.server.update({
      where: { id: serverId },
      data: { steamUsername: null, steamPasswordEnc: null },
    });
  }

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

  async add(serverId: string, input: string) {
    await this.loadServer(serverId);
    const workshopId = WorkshopService.parseId(input);
    if (!workshopId) {
      throw new BadRequestException('Enter a Workshop ID or URL');
    }

    const existing = await this.prisma.workshopMod.findUnique({
      where: { serverId_workshopId: { serverId, workshopId } },
    });
    if (existing) return existing;

    const meta = await this.resolve(workshopId);
    const count = await this.prisma.workshopMod.count({ where: { serverId } });
    return this.prisma.workshopMod.create({
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
  async apply(
    serverId: string,
    opts: { steamGuardCode?: string } = {},
  ): Promise<{ accepted: true }> {
    const server = await this.loadServer(serverId);

    // Stash a one-time Steam Guard code for this install (consumed + cleared by
    // the reinstall job). Only meaningful with a per-server login set.
    const guardCode = opts.steamGuardCode?.trim();
    if (guardCode) {
      await this.prisma.server.update({
        where: { id: serverId },
        data: { steamGuardCode: guardCode },
      });
    }
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
    } satisfies ReinstallJob);
    return { accepted: true };
  }

  // ---- Steam Web API (public endpoints; best-effort) ---------------------

  private static readonly STEAM_API = 'https://api.steampowered.com';

  /** Resolve an id's display name + whether it's a collection. Never throws. */
  private async resolve(
    workshopId: string,
  ): Promise<{ name: string | null; kind: WorkshopKind }> {
    // A collection returns child items from GetCollectionDetails.
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
      if (res.ok) {
        const data = (await res.json()) as {
          response?: { collectiondetails?: Array<{ result?: number; children?: unknown[] }> };
        };
        const det = data.response?.collectiondetails?.[0];
        if (det?.result === 1 && Array.isArray(det.children) && det.children.length) {
          return { name: await this.itemTitle(workshopId), kind: 'COLLECTION' };
        }
      }
    } catch {
      /* network/timeouts — fall through to ITEM */
    }
    return { name: await this.itemTitle(workshopId), kind: 'ITEM' };
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
