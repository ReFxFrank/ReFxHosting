import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { GiftCard, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { uuidv7 } from '../common/util/uuid';
import { CreateGiftCardDto, UpdateGiftCardDto } from './dto/gift-card.dto';

/** Generate a human-friendly gift code like GIFT-7H2K-9QP4-3M8X. */
function generateCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const block = () =>
    Array.from(randomBytes(4))
      .map((b) => alphabet[b % alphabet.length])
      .join('');
  return `GIFT-${block()}-${block()}-${block()}`;
}

/**
 * Gift cards: stored-value codes. Admins issue them with a balance; customers
 * redeem them against an invoice at checkout, drawing the balance down. Every
 * movement is recorded in GiftCardTransaction for audit.
 */
@Injectable()
export class GiftCardsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- admin -------------------------------------------------------------

  list() {
    return this.prisma.giftCard.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async create(dto: CreateGiftCardDto): Promise<GiftCard> {
    const code = (dto.code?.trim() || generateCode()).toUpperCase();
    const exists = await this.prisma.giftCard.findUnique({ where: { code } });
    if (exists) throw new BadRequestException('That gift-card code already exists');
    if (dto.initialBalanceMinor <= 0) {
      throw new BadRequestException('Balance must be greater than zero');
    }
    return this.prisma.giftCard.create({
      data: {
        id: uuidv7(),
        code,
        initialBalanceMinor: dto.initialBalanceMinor,
        balanceMinor: dto.initialBalanceMinor,
        currency: (dto.currency ?? 'USD').toUpperCase(),
        note: dto.note ?? null,
        expiresAt: dto.expiresAt ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateGiftCardDto): Promise<GiftCard> {
    const card = await this.prisma.giftCard.findUnique({ where: { id } });
    if (!card) throw new NotFoundException('Gift card not found');
    const data: Prisma.GiftCardUpdateInput = {};
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.note !== undefined) data.note = dto.note || null;
    if (dto.expiresAt !== undefined) data.expiresAt = dto.expiresAt;
    return this.prisma.giftCard.update({ where: { id }, data });
  }

  // ---- checkout ----------------------------------------------------------

  /** Look up + validate a redeemable card (active, not expired, has balance). */
  async lookup(code: string): Promise<GiftCard> {
    const card = await this.prisma.giftCard.findUnique({
      where: { code: code.trim().toUpperCase() },
    });
    if (!card || !card.isActive) throw new BadRequestException('Invalid gift card');
    if (card.expiresAt && card.expiresAt < new Date()) {
      throw new BadRequestException('This gift card has expired');
    }
    if (card.balanceMinor <= 0) {
      throw new BadRequestException('This gift card has no remaining balance');
    }
    return card;
  }

  /**
   * Apply up to `maxApplyMinor` of a gift card's balance toward an invoice:
   * draws the balance down, records the transaction, and bumps the invoice's
   * amountPaid (so the gateway only charges the remainder). Returns the amount
   * applied. The order flow marks the invoice paid if the remainder is zero.
   */
  async redeemForInvoice(
    code: string,
    userId: string,
    invoiceId: string,
    maxApplyMinor: number,
  ): Promise<number> {
    const card = await this.lookup(code);
    const applied = Math.max(0, Math.min(card.balanceMinor, maxApplyMinor));
    if (applied <= 0) return 0;

    await this.prisma.$transaction([
      this.prisma.giftCard.update({
        where: { id: card.id },
        data: { balanceMinor: { decrement: applied } },
      }),
      this.prisma.giftCardTransaction.create({
        data: {
          id: uuidv7(),
          giftCardId: card.id,
          userId,
          invoiceId,
          amountMinor: -applied,
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
