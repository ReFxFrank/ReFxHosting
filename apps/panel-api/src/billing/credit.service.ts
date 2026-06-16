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
      select: { creditBalanceMinor: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const next = user.creditBalanceMinor + amountMinor;
    if (next < 0) {
      throw new BadRequestException('Insufficient credit balance for this deduction');
    }
    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { creditBalanceMinor: next },
        select: { creditBalanceMinor: true },
      }),
      this.prisma.creditTransaction.create({
        data: {
          id: uuidv7(),
          userId,
          amountMinor,
          reason,
          note: opts.note ?? null,
          invoiceId: opts.invoiceId ?? null,
          actorId: opts.actorId ?? null,
        },
      }),
    ]);
    return { balanceMinor: updated.creditBalanceMinor };
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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { creditBalanceMinor: true },
    });
    const applied = Math.max(0, Math.min(user?.creditBalanceMinor ?? 0, maxApplyMinor));
    if (applied <= 0) return 0;

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { creditBalanceMinor: { decrement: applied } },
      }),
      this.prisma.creditTransaction.create({
        data: {
          id: uuidv7(),
          userId,
          amountMinor: -applied,
          reason: CreditReason.INVOICE_PAYMENT,
          invoiceId,
        },
      }),
      this.prisma.invoice.update({
        where: { id: invoiceId },
        data: { amountPaidMinor: { increment: applied } },
      }),
    ]);
    return applied;
  }
}
