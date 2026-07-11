import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { CreditReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreditService } from './credit.service';
import { SettingsService } from '../platform/settings.service';

/**
 * Give-and-get referral program: every customer has a shareable code; a signup
 * carrying it links the accounts, and when the referred customer's FIRST
 * invoice is paid, BOTH sides receive store credit (existing credit ledger,
 * reason REFERRAL). Reward amount + enablement are owner-configurable.
 *
 * Fraud posture: reward fires once per referred account (atomic claim on
 * referralRewardedAt), never for self-referrals, and only on a real paid
 * invoice with a positive total — a $0 fully-couponed order earns nothing.
 */

/** Unambiguous alphabet (no 0/O/1/I) for hand-typed codes. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

function generateCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credit: CreditService,
    private readonly settings: SettingsService,
  ) {}

  /** The caller's referral state: code (created on demand) + earnings. */
  async myReferral(userId: string) {
    const cfg = await this.settings.referralConfig();
    let user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, referralCode: true },
    });
    if (user && !user.referralCode) {
      // Lazy code creation with collision retry (31^8 space; collisions are
      // lottery-rare but the unique index makes them harmless).
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          user = await this.prisma.user.update({
            where: { id: userId },
            data: { referralCode: generateCode() },
            select: { id: true, referralCode: true },
          });
          break;
        } catch {
          /* unique collision — retry */
        }
      }
    }
    const [referredCount, rewardedCount, earned] = await Promise.all([
      this.prisma.user.count({ where: { referredById: userId } }),
      this.prisma.user.count({
        where: { referredById: userId, referralRewardedAt: { not: null } },
      }),
      this.prisma.creditTransaction.aggregate({
        where: { userId, reason: CreditReason.REFERRAL },
        _sum: { amountMinor: true },
      }),
    ]);
    return {
      enabled: cfg.enabled,
      rewardMinor: cfg.rewardMinor,
      code: user?.referralCode ?? null,
      referredCount,
      convertedCount: rewardedCount,
      earnedMinor: earned._sum.amountMinor ?? 0,
    };
  }

  /**
   * Link a fresh signup to its referrer (called from registration).
   * Best-effort: an unknown/garbled code silently registers unreferred —
   * never block account creation over a marketing link.
   */
  async attachReferrer(newUserId: string, code: string): Promise<void> {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    const referrer = await this.prisma.user.findUnique({
      where: { referralCode: normalized },
      select: { id: true, deletedAt: true },
    });
    if (!referrer || referrer.deletedAt || referrer.id === newUserId) return;
    await this.prisma.user.updateMany({
      // Only ever set once, and never on an account that already has one.
      where: { id: newUserId, referredById: null },
      data: { referredById: referrer.id },
    });
  }

  /**
   * Grant the two-sided reward when a referred customer's first real payment
   * lands. Called from markInvoicePaid on the OPEN→PAID transition; must
   * never throw into settlement.
   */
  async rewardFirstPayment(userId: string, paidMinor: number): Promise<void> {
    try {
      if (paidMinor <= 0) return;
      const cfg = await this.settings.referralConfig();
      if (!cfg.enabled || cfg.rewardMinor <= 0) return;

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, referredById: true, referralRewardedAt: true },
      });
      if (!user?.referredById || user.referralRewardedAt) return;

      // Atomic once-only claim — concurrent webhook re-deliveries race here,
      // exactly one wins.
      const claimed = await this.prisma.user.updateMany({
        where: { id: userId, referralRewardedAt: null },
        data: { referralRewardedAt: new Date() },
      });
      if (claimed.count !== 1) return;

      await this.credit.adjust(user.referredById, cfg.rewardMinor, CreditReason.REFERRAL, {
        note: `Referral reward — ${user.email} made their first purchase`,
      });
      await this.credit.adjust(userId, cfg.rewardMinor, CreditReason.REFERRAL, {
        note: 'Welcome reward — you joined through a referral',
      });
      this.logger.log(
        `referral reward granted: referrer ${user.referredById} + referee ${userId} (${cfg.rewardMinor} minor each)`,
      );
    } catch (e) {
      this.logger.warn(
        `referral reward failed for user ${userId}: ${(e as Error).message}`,
      );
    }
  }
}
