import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../platform/settings.service";
import { ServersService } from "./servers.service";
import { uuidv7 } from "../common/util/uuid";

/** Hard cap — matches the egg variable's rules and the launcher's clamp. */
export const MAX_HEADLESS_CLIENTS = 3;

/** Env var the Arma 3 launcher reads; panel-managed via this service. */
const HC_VAR = "HEADLESS_CLIENTS";

export interface HeadlessClientsStatus {
  /** Add-on offered at all (admin toggle). */
  enabled: boolean;
  /** Fee per client per month, minor units. */
  monthlyMinor: number;
  currency: string;
  /** Currently purchased/applied count. */
  count: number;
  max: number;
  /** True when the server has no subscription (admin-made) — changes apply
   *  without billing, mirroring the express-backups comp behavior. */
  unbilled: boolean;
}

/**
 * Paid headless-clients add-on (Arma 3 AI offload). The purchased count lives
 * on the subscription (billed as a per-cycle invoice line: count × monthly
 * fee) and is applied to the server as the HEADLESS_CLIENTS variable, which
 * the egg's launcher turns into `-client -connect=127.0.0.1` processes inside
 * the server's own container/limits. Changes apply on the next restart;
 * billing changes take effect on the next renewal invoice (no mid-cycle
 * proration — decreases simply bill less next cycle).
 */
@Injectable()
export class HeadlessClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly servers: ServersService,
  ) {}

  private async load(serverId: string) {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      select: {
        id: true,
        ownerId: true,
        subscriptionId: true,
        template: {
          select: {
            slug: true,
            variables: {
              where: { envName: HC_VAR },
              select: { envName: true },
            },
          },
        },
        variables: {
          where: { envName: HC_VAR },
          select: { value: true },
        },
      },
    });
    if (!server) throw new NotFoundException("Server not found");
    if (!server.template?.variables.length) {
      throw new BadRequestException(
        "This game does not support headless clients",
      );
    }
    return server;
  }

  /** Currency follows the subscription's price, like the vanity add-on. */
  private async currencyFor(subscriptionId: string | null): Promise<string> {
    if (!subscriptionId) return "USD";
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: { priceId: true },
    });
    if (!sub) return "USD";
    const price = await this.prisma.price.findUnique({
      where: { id: sub.priceId },
      select: { currency: true },
    });
    return price?.currency || "USD";
  }

  async status(serverId: string): Promise<HeadlessClientsStatus> {
    const server = await this.load(serverId);
    const cfg = await this.settings.headlessClientsConfig();
    const applied = Number(server.variables[0]?.value ?? "0") || 0;
    let count = applied;
    if (server.subscriptionId) {
      const sub = await this.prisma.subscription.findUnique({
        where: { id: server.subscriptionId },
        select: { headlessClients: true },
      });
      count = sub?.headlessClients ?? applied;
    }
    return {
      enabled: cfg.enabled,
      monthlyMinor: cfg.monthlyMinor,
      currency: await this.currencyFor(server.subscriptionId),
      count,
      max: MAX_HEADLESS_CLIENTS,
      unbilled: !server.subscriptionId,
    };
  }

  /**
   * Set the purchased count. Owner-only — it changes what the owner is billed,
   * so sub-users and the staff support override must not reach it (mirrors the
   * vanity-address rule). Applies the variable immediately (takes effect on the
   * next restart) and bills from the next renewal invoice.
   */
  async setCount(
    serverId: string,
    userId: string,
    countRaw: number,
  ): Promise<HeadlessClientsStatus> {
    const server = await this.load(serverId);
    if (server.ownerId !== userId) {
      throw new ForbiddenException(
        "Only the server owner can change headless clients.",
      );
    }
    const cfg = await this.settings.headlessClientsConfig();
    if (!cfg.enabled) {
      throw new BadRequestException(
        "Headless clients are not available right now.",
      );
    }
    const count = Math.max(
      0,
      Math.min(MAX_HEADLESS_CLIENTS, Math.round(countRaw)),
    );

    // Billing side: persist the purchased count on the subscription (renewal
    // invoices add the line). Admin-made servers have no subscription — apply
    // unbilled, mirroring how express-backups comp works for those servers.
    if (server.subscriptionId) {
      await this.prisma.subscription.update({
        where: { id: server.subscriptionId },
        data: { headlessClients: count },
      });
    }

    // Server side: the variable the launcher consumes, fresh on next boot.
    await this.prisma.serverVariable.upsert({
      where: { serverId_envName: { serverId, envName: HC_VAR } },
      create: { id: uuidv7(), serverId, envName: HC_VAR, value: String(count) },
      update: { value: String(count) },
    });
    await this.servers.reloadSpec(serverId);

    return this.status(serverId);
  }
}
