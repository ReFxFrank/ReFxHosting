import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Coupon, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { uuidv7 } from '../common/util/uuid';
import {
  CreateCouponDto,
  UpdateCouponDto,
} from './dto/coupon.dto';

export interface CouponValidation {
  coupon: Coupon;
  discountMinor: number;
}

/**
 * Coupon codes: admin CRUD plus validation/redemption used at checkout. Discounts
 * apply to the order subtotal (before tax); a fixed discount is capped at the
 * subtotal. Usage windows, global + per-user caps, and minimum-order are enforced.
 */
@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- admin -------------------------------------------------------------

  list() {
    return this.prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { redemptions: true } } },
    });
  }

  async create(dto: CreateCouponDto): Promise<Coupon> {
    const code = dto.code.trim().toUpperCase();
    if (!code) throw new BadRequestException('Code is required');
    if (dto.kind === 'PERCENT' && (dto.value < 1 || dto.value > 100)) {
      throw new BadRequestException('A percentage coupon must be 1–100');
    }
    const exists = await this.prisma.coupon.findUnique({ where: { code } });
    if (exists) throw new ConflictException('A coupon with that code already exists');

    return this.prisma.coupon.create({
      data: {
        id: uuidv7(),
        code,
        description: dto.description ?? null,
        kind: dto.kind,
        value: dto.value,
        currency: (dto.currency ?? 'USD').toUpperCase(),
        minSubtotalMinor: dto.minSubtotalMinor ?? null,
        maxRedemptions: dto.maxRedemptions ?? null,
        maxPerUser: dto.maxPerUser ?? null,
        startsAt: dto.startsAt ?? null,
        expiresAt: dto.expiresAt ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateCouponDto): Promise<Coupon> {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    if (dto.kind === 'PERCENT' && dto.value !== undefined && (dto.value < 1 || dto.value > 100)) {
      throw new BadRequestException('A percentage coupon must be 1–100');
    }
    const data: Prisma.CouponUpdateInput = {};
    if (dto.code !== undefined) {
      const code = dto.code.trim().toUpperCase();
      const clash = await this.prisma.coupon.findUnique({ where: { code } });
      if (clash && clash.id !== id) {
        throw new ConflictException('A coupon with that code already exists');
      }
      data.code = code;
    }
    if (dto.description !== undefined) data.description = dto.description || null;
    if (dto.kind !== undefined) data.kind = dto.kind;
    if (dto.value !== undefined) data.value = dto.value;
    if (dto.currency !== undefined) data.currency = dto.currency.toUpperCase();
    if (dto.minSubtotalMinor !== undefined) data.minSubtotalMinor = dto.minSubtotalMinor;
    if (dto.maxRedemptions !== undefined) data.maxRedemptions = dto.maxRedemptions;
    if (dto.maxPerUser !== undefined) data.maxPerUser = dto.maxPerUser;
    if (dto.startsAt !== undefined) data.startsAt = dto.startsAt;
    if (dto.expiresAt !== undefined) data.expiresAt = dto.expiresAt;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.coupon.update({ where: { id }, data });
  }

  async remove(id: string): Promise<{ id: string }> {
    const coupon = await this.prisma.coupon.findUnique({ where: { id }, select: { id: true } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    await this.prisma.coupon.delete({ where: { id } });
    return { id };
  }

  // ---- checkout ----------------------------------------------------------

  /** Validate a code for a user + subtotal, returning the computed discount. Throws on any failure. */
  async validate(
    code: string,
    userId: string,
    subtotalMinor: number,
  ): Promise<CouponValidation> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: code.trim().toUpperCase() },
    });
    if (!coupon || !coupon.isActive) {
      throw new BadRequestException('Invalid coupon code');
    }
    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) {
      throw new BadRequestException('This coupon is not active yet');
    }
    if (coupon.expiresAt && coupon.expiresAt < now) {
      throw new BadRequestException('This coupon has expired');
    }
    if (coupon.maxRedemptions != null && coupon.timesRedeemed >= coupon.maxRedemptions) {
      throw new BadRequestException('This coupon has reached its redemption limit');
    }
    if (coupon.minSubtotalMinor != null && subtotalMinor < coupon.minSubtotalMinor) {
      throw new BadRequestException(
        `This coupon needs a minimum order of ${(coupon.minSubtotalMinor / 100).toFixed(2)} ${coupon.currency}`,
      );
    }
    if (coupon.maxPerUser != null) {
      const used = await this.prisma.couponRedemption.count({
        where: { couponId: coupon.id, userId },
      });
      if (used >= coupon.maxPerUser) {
        throw new BadRequestException('You have already used this coupon');
      }
    }

    let discountMinor =
      coupon.kind === 'PERCENT'
        ? Math.floor((subtotalMinor * coupon.value) / 100)
        : coupon.value;
    discountMinor = Math.max(0, Math.min(discountMinor, subtotalMinor));

    return { coupon, discountMinor };
  }

  /** Record a redemption + bump the usage counter (call after the invoice is created). */
  async recordRedemption(
    couponId: string,
    userId: string,
    invoiceId: string,
    amountMinor: number,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.couponRedemption.create({
        data: { id: uuidv7(), couponId, userId, invoiceId, amountMinor },
      }),
      this.prisma.coupon.update({
        where: { id: couponId },
        data: { timesRedeemed: { increment: 1 } },
      }),
    ]);
  }
}
