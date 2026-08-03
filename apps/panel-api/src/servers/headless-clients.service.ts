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
  /** Purchased count — the only number that is ever billed. */
  count: number;
  /** Free clients granted by staff (admin comp); never billed. */
  compedCount: number;
  /** What actually runs on the server: max(count, compedCount). */
  appliedCount: number;
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
        headlessClientsComp: true,
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

  private clamp(count: number): number {
    return Math.max(0, Math.min(MAX_HEADLESS_CLIENTS, Math.round(count)));
  }

  /** Purchased count on the subscription; 0 when the server has none. */
  private async paidCount(subscriptionId: string | null): Promise<number> {
    if (!subscriptionId) return 0;
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: { headlessClients: true },
    });
    return sub?.headlessClients ?? 0;
  }

  async status(serverId: string): Promise<HeadlessClientsStatus> {
    const server = await this.load(serverId);
    const cfg = await this.settings.headlessClientsConfig();
    const paid = await this.paidCount(server.subscriptionId);
    const comped = server.headlessClientsComp ?? 0;
    const unbilled = !server.subscriptionId;
    return {
      enabled: cfg.enabled,
      monthlyMinor: cfg.monthlyMinor,
      currency: await this.currencyFor(server.subscriptionId),
      // Nothing is billed without a subscription, so the single stored count
      // is reported as the owner's own — a "comped by staff" split would be
      // meaningless when neither side is ever charged.
      count: unbilled ? comped : paid,
      compedCount: unbilled ? 0 : comped,
      appliedCount: this.clamp(Math.max(paid, comped)),
      max: MAX_HEADLESS_CLIENTS,
      unbilled,
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
    const count = this.clamp(countRaw);

    // Billing side: persist the purchased count on the subscription (renewal
    // invoices add the line). Admin-made servers have no subscription — apply
    // unbilled, mirroring how express-backups comp works for those servers.
    if (server.subscriptionId) {
      await this.prisma.subscription.update({
        where: { id: server.subscriptionId },
        data: { headlessClients: count },
      });
    } else {
      // No subscription, so no paid count to record: the server's own column
      // IS the applied state here, which also lets the owner lower it again.
      await this.prisma.server.update({
        where: { id: serverId },
        data: { headlessClientsComp: count },
      });
    }
    // A staff comp keeps applying even when the customer buys fewer.
    await this.apply(serverId);
    return this.status(serverId);
  }

  /**
   * Admin comp: grant N headless clients free of charge (support/goodwill).
   * Never touches `Subscription.headlessClients`, so the renewal invoice line
   * keeps billing only what the customer actually bought; the applied count
   * becomes max(paid, comped). Passing 0 removes the comp and drops the server
   * back to the paid count. Not gated on the add-on being publicly offered —
   * staff must be able to comp a server whatever the storefront is doing.
   *
   * The count lives on the SERVER row so a subscription-less (admin-made)
   * server can be comped and un-comped like any other; the subscription's copy
   * is kept in step for the billing domain but is never what applies.
   */
  async setComp(
    serverId: string,
    countRaw: number,
  ): Promise<HeadlessClientsStatus> {
    const server = await this.load(serverId);
    const comped = this.clamp(countRaw);

    await this.prisma.server.update({
      where: { id: serverId },
      data: { headlessClientsComp: comped },
    });
    // Mirror onto the subscription so the comp is visible from the billing
    // domain, exactly as `expressBackupsComp` is. It never drives the count.
    if (server.subscriptionId) {
      await this.prisma.subscription.update({
        where: { id: server.subscriptionId },
        data: { headlessClientsComp: comped },
      });
    }
    await this.apply(serverId);
    return this.status(serverId);
  }

  /**
   * Re-derive the variable the launcher consumes from whichever side just
   * changed plus the current value of the other, then push the spec. Both
   * counts are read back INSIDE the write transaction, so two concurrent
   * mutators (a customer purchase and a staff comp) can't apply a count
   * derived from a stale snapshot of the other.
   */
  private async apply(serverId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const server = await tx.server.findUnique({
        where: { id: serverId },
        select: {
          headlessClientsComp: true,
          subscription: { select: { headlessClients: true } },
        },
      });
      const effective = this.clamp(
        Math.max(
          server?.subscription?.headlessClients ?? 0,
          server?.headlessClientsComp ?? 0,
        ),
      );
      await tx.serverVariable.upsert({
        where: { serverId_envName: { serverId, envName: HC_VAR } },
        create: {
          id: uuidv7(),
          serverId,
          envName: HC_VAR,
          value: String(effective),
        },
        update: { value: String(effective) },
      });
    });
    await this.servers.reloadSpec(serverId);
  }
}
