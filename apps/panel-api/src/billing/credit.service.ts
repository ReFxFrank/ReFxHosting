import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreditReason, CreditTransaction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { uuidv7 } from '../common/util/uuid';

/**
 * Per-user store credit. A balance lives on the User; every change is recorded
 * in CreditTransaction. Credit is granted by admins (or refunds) and applied to
 * invoices at checkout, drawing the balance down (the gateway then charges only
 * the remainder).
 */
@Injectable()
export class CreditService {
  constructor(private readonly prisma: PrismaService) {}

  async balance(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { creditBalanceMinor: true },
    });
    return user?.creditBalanceMinor ?? 0;
  }

  listTransactions(userId: string): Promise<CreditTransaction[]> {
    return this.prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Adjust a user's credit by a signed amount and log it. Refuses to push the
   * balance below zero. Returns the new balance.
   */
  async adjust(
    userId: string,
    amountMinor: number,
    reason: CreditReason,
    opts: { note?: string; invoiceId?: string; actorId?: string } = {},
  ): Promise<{ balanceMinor: number }> {
    if (!Number.isInteger(amountMinor) || amountMinor === 0) {
      throw new BadRequestException('Amount must be a non-zero integer (minor units)');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // Apply atomically via increment/decrement (never an absolute set) so
    // concurrent grants/deductions don't clobber one another; a deduction is
    // guarded so the balance can't go negative.
    return this.prisma.$transaction(async (tx) => {
      if (amountMinor < 0) {
        const drawn = await tx.user.updateMany({
          where: { id: userId, creditBalanceMinor: { gte: -amountMinor } },
          data: { creditBalanceMinor: { increment: amountMinor } },
        });
        if (drawn.count === 0) {
          throw new BadRequestException('Insufficient credit balance for this deduction');
        }
      } else {
        await tx.user.update({
          where: { id: userId },
          data: { creditBalanceMinor: { increment: amountMinor } },
        });
      }
      await tx.creditTransaction.create({
        data: {
          id: uuidv7(),
          userId,
          amountMinor,
          reason,
          note: opts.note ?? null,
          invoiceId: opts.invoiceId ?? null,
          actorId: opts.actorId ?? null,
        },
      });
      const fresh = await tx.user.findUnique({
        where: { id: userId },
        select: { creditBalanceMinor: true },
      });
      return { balanceMinor: fresh?.creditBalanceMinor ?? 0 };
    });
  }

  /**
   * Apply up to `maxApplyMinor` of a user's credit toward an invoice: draws the
   * balance down, logs it, and bumps the invoice's amountPaid (so the gateway
   * only charges the remainder). Returns the amount applied.
   */
  async applyToInvoice(
    userId: string,
    invoiceId: string,
    maxApplyMinor: number,
  ): Promise<number> {
    // Guarded draw-down (balance >= applied) so concurrent applications can't
    // overspend the balance below zero; a lost race yields 0 applied.
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { creditBalanceMinor: true },
      });
      const applied = Math.max(0, Math.min(user?.creditBalanceMinor ?? 0, maxApplyMinor));
      if (applied <= 0) return 0;

      const drawn = await tx.user.updateMany({
        where: { id: userId, creditBalanceMinor: { gte: applied } },
        data: { creditBalanceMinor: { decrement: applied } },
      });
      if (drawn.count === 0) return 0;

      await tx.creditTransaction.create({
        data: {
          id: uuidv7(),
          userId,
          amountMinor: -applied,
          reason: CreditReason.INVOICE_PAYMENT,
          invoiceId,
        },
      });
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { amountPaidMinor: { increment: applied } },
      });
      return applied;
    });
  }
}
