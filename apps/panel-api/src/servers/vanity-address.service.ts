import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { CreditService } from '../billing/credit.service';
import { SettingsService } from '../platform/settings.service';
import { uuidv7 } from '../common/util/uuid';
import { buildAllocationAlias, normalizeGameDomain } from './allocation-port.util';
import { validateVanityLabel } from './vanity-address.util';

/** Result of a vanity purchase — mirrors the plan-change discriminated union
 * the web already understands (applied now vs. pay-the-invoice-first). */
export type VanityPurchaseResult =
  | { status: 'applied'; label: string; address: string }
  | {
      status: 'invoiced';
      label: string;
      address: string;
      invoiceId: string;
      amountMinor: number;
      currency: string;
    };

/**
 * Paid custom server addresses ("vanity labels"): replace the random
 * `<shortId>.<node.gameDomain>` advertised address with a purchased word
 * (`whatever.virginia.rfx.refx.gg`). Wildcard node DNS already resolves any
 * label, so this is validation + uniqueness + billing + alias rewrite — no DNS
 * automation. Pay-then-apply mirrors PendingPlanChange: the label is reserved
 * while the invoice is OPEN, applied by markInvoicePaid, released on void.
 */
@Injectable()
export class VanityAddressService {
  private readonly logger = new Logger(VanityAddressService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly credit: CreditService,
    private readonly settings: SettingsService,
  ) {}

  private async loadServer(serverId: string) {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      include: { node: { select: { gameDomain: true } } },
    });
    if (!server) throw new NotFoundException('Server not found');
    return server;
  }

  /** Currency the fee will be charged in (the subscription's price currency). */
  private async currencyFor(subscriptionId: string | null): Promise<string> {
    if (!subscriptionId) return 'USD';
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: { priceId: true },
    });
    if (!sub) return 'USD';
    const price = await this.prisma.price.findUnique({
      where: { id: sub.priceId },
      select: { currency: true },
    });
    return price?.currency || 'USD';
  }

  /** Status payload for the customer card. */
  async status(serverId: string) {
    const server = await this.loadServer(serverId);
    const cfg = await this.settings.vanityConfig();
    const gameDomain = normalizeGameDomain(server.node?.gameDomain);
    const primary = await this.prisma.allocation.findFirst({
      where: { serverId, isPrimary: true },
      select: { alias: true, ip: true, port: true },
    });
    const pending = await this.prisma.pendingVanityAddress.findUnique({
      where: { serverId },
      select: { label: true, invoiceId: true, invoice: { select: { totalMinor: true, currency: true } } },
    });
    return {
      enabled: cfg.enabled && !!gameDomain,
      gameDomain,
      feeMinor: cfg.feeMinor,
      currency: await this.currencyFor(server.subscriptionId),
      currentLabel: server.vanityLabel,
      currentAddress: primary
        ? `${primary.alias || primary.ip}:${primary.port}`
        : null,
      pending: pending
        ? {
            label: pending.label,
            address: gameDomain ? `${pending.label}.${gameDomain}` : pending.label,
            invoiceId: pending.invoiceId,
            amountMinor: pending.invoice?.totalMinor ?? cfg.feeMinor,
            currency: pending.invoice?.currency ?? 'USD',
          }
        : null,
    };
  }

  /**
   * Buy a custom address (or a rename — each purchase is charged the full fee).
   * Owner-only: it raises an invoice on the owner's subscription, so sub-users
   * and the staff support override must not be able to spend the owner's money.
   */
  async purchase(
    serverId: string,
    userId: string,
    labelInput: string,
  ): Promise<VanityPurchaseResult> {
    const server = await this.loadServer(serverId);
    if (server.ownerId !== userId) {
      throw new ForbiddenException(
        'Only the server owner can purchase a custom address.',
      );
    }
    const cfg = await this.settings.vanityConfig();
    if (!cfg.enabled) {
      throw new BadRequestException('Custom addresses are not available right now.');
    }
    const gameDomain = normalizeGameDomain(server.node?.gameDomain);
    if (!gameDomain) {
      throw new BadRequestException(
        'This location does not support custom addresses yet.',
      );
    }
    const label = validateVanityLabel(labelInput, cfg.reservedWords);
    if (server.vanityLabel === label) {
      throw new BadRequestException('That is already your server address.');
    }
    // Friendly pre-checks; the DB unique indexes are the authoritative guards.
    const taken = await this.prisma.server.findUnique({
      where: { vanityLabel: label },
      select: { id: true },
    });
    if (taken && taken.id !== serverId) {
      throw new ConflictException('That name is already taken.');
    }
    const address = `${label}.${gameDomain}`;

    // Free (admin set the fee to 0): apply immediately, no invoice.
    if (cfg.feeMinor <= 0) {
      await this.applyLabel(serverId, label, gameDomain);
      return { status: 'applied', label, address };
    }

    if (!server.subscriptionId) {
      throw new BadRequestException(
        'This server has no active subscription to bill the fee to.',
      );
    }

    // Claim the reservation FIRST (unique on serverId + label), then invoice;
    // roll the claim back if invoicing fails — same choreography as plan changes.
    let pendingId: string;
    try {
      const created = await this.prisma.pendingVanityAddress.create({
        data: { id: uuidv7(), serverId, label },
        select: { id: true },
      });
      pendingId = created.id;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const target = String(
          (e.meta as { target?: string[] | string })?.target ?? '',
        );
        if (target.includes('serverId')) {
          throw new ConflictException(
            'A custom-address purchase is already pending for this server — pay or cancel it first.',
          );
        }
        throw new ConflictException(
          'That name was just reserved by someone else.',
        );
      }
      throw e;
    }

    let invoice;
    try {
      invoice = await this.billing.createUpgradeInvoice(server.subscriptionId, {
        amountMinor: cfg.feeMinor,
        description: `Custom server address: ${address}`,
      });
    } catch (e) {
      await this.prisma.pendingVanityAddress
        .deleteMany({ where: { id: pendingId } })
        .catch(() => undefined);
      throw e;
    }
    await this.prisma.pendingVanityAddress.update({
      where: { id: pendingId },
      data: { invoiceId: invoice.id },
    });

    return {
      status: 'invoiced',
      label,
      address,
      invoiceId: invoice.id,
      amountMinor: invoice.totalMinor,
      currency: invoice.currency,
    };
  }

  /**
   * Owner removal: cancel a pending (unpaid) purchase — voiding its invoice
   * releases the reserved word — or drop an owned label back to the default
   * shortId address. No refund.
   */
  async remove(serverId: string, userId: string): Promise<{ removed: boolean }> {
    const server = await this.loadServer(serverId);
    if (server.ownerId !== userId) {
      throw new ForbiddenException(
        'Only the server owner can remove the custom address.',
      );
    }
    return this.removeInternal(server);
  }

  /**
   * Admin/ToS removal (impersonation, abuse): clears the label, reverts the
   * advertised address, optionally refunds the configured fee as store credit,
   * and notifies the owner.
   */
  async adminRemove(
    serverId: string,
    opts: { refundCredit?: boolean; actorId?: string } = {},
  ): Promise<{ removed: boolean }> {
    const server = await this.loadServer(serverId);
    const hadLabel = server.vanityLabel;
    const result = await this.removeInternal(server);
    if (opts.refundCredit && hadLabel) {
      const cfg = await this.settings.vanityConfig();
      if (cfg.feeMinor > 0) {
        await this.credit
          .adjust(server.ownerId, cfg.feeMinor, 'REFUND', {
            note: `Custom address "${hadLabel}" removed by staff`,
            actorId: opts.actorId,
          })
          .catch((e) =>
            this.logger.warn(`vanity refund credit failed: ${String(e)}`),
          );
      }
    }
    if (hadLabel) {
      await this.prisma.notification
        .create({
          data: {
            id: uuidv7(),
            userId: server.ownerId,
            channel: 'IN_APP',
            title: 'Custom server address removed',
            body:
              `Your custom address "${hadLabel}" was removed by staff` +
              (opts.refundCredit ? ' and the fee was refunded as store credit.' : '.'),
          },
        })
        .catch(() => undefined);
    }
    return result;
  }

  private async removeInternal(server: {
    id: string;
    shortId: string;
    vanityLabel: string | null;
    node: { gameDomain: string | null } | null;
  }): Promise<{ removed: boolean }> {
    const pending = await this.prisma.pendingVanityAddress.findUnique({
      where: { serverId: server.id },
      select: { id: true, invoiceId: true },
    });
    if (pending) {
      if (pending.invoiceId) {
        // Voiding cascades: voidInvoice deletes the pending row (and the word
        // becomes available again).
        await this.billing.voidInvoice(pending.invoiceId);
      } else {
        await this.prisma.pendingVanityAddress.deleteMany({
          where: { id: pending.id },
        });
      }
      return { removed: true };
    }
    if (!server.vanityLabel) return { removed: false };
    const gameDomain = normalizeGameDomain(server.node?.gameDomain);
    const fallback = buildAllocationAlias(server.shortId, gameDomain);
    await this.prisma.$transaction([
      this.prisma.server.update({
        where: { id: server.id },
        data: { vanityLabel: null },
      }),
      this.prisma.allocation.updateMany({
        where: { serverId: server.id, alias: { not: null } },
        data: { alias: fallback },
      }),
    ]);
    return { removed: true };
  }

  /** Set the label + rewrite advertised aliases now (free-fee or admin path). */
  private async applyLabel(
    serverId: string,
    label: string,
    gameDomain: string,
  ): Promise<void> {
    const alias = buildAllocationAlias(label, gameDomain);
    try {
      await this.prisma.$transaction([
        this.prisma.server.update({
          where: { id: serverId },
          data: { vanityLabel: label },
        }),
        this.prisma.allocation.updateMany({
          where: { serverId, alias: { not: null } },
          data: { alias },
        }),
      ]);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('That name is already taken.');
      }
      throw e;
    }
  }
}
