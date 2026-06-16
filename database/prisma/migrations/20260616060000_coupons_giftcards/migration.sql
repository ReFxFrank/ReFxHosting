-- Coupons & gift cards.
CREATE TYPE "CouponKind" AS ENUM ('PERCENT', 'FIXED');

ALTER TABLE "Invoice"
  ADD COLUMN "discountMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "couponCode" TEXT;

CREATE TABLE "Coupon" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "kind" "CouponKind" NOT NULL,
  "value" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "minSubtotalMinor" INTEGER,
  "maxRedemptions" INTEGER,
  "timesRedeemed" INTEGER NOT NULL DEFAULT 0,
  "maxPerUser" INTEGER,
  "startsAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

CREATE TABLE "CouponRedemption" (
  "id" UUID NOT NULL,
  "couponId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "invoiceId" UUID,
  "amountMinor" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CouponRedemption_couponId_idx" ON "CouponRedemption"("couponId");
CREATE INDEX "CouponRedemption_userId_idx" ON "CouponRedemption"("userId");
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey"
  FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GiftCard" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "initialBalanceMinor" INTEGER NOT NULL,
  "balanceMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GiftCard_code_key" ON "GiftCard"("code");

CREATE TABLE "GiftCardTransaction" (
  "id" UUID NOT NULL,
  "giftCardId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "invoiceId" UUID,
  "amountMinor" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GiftCardTransaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GiftCardTransaction_giftCardId_idx" ON "GiftCardTransaction"("giftCardId");
ALTER TABLE "GiftCardTransaction" ADD CONSTRAINT "GiftCardTransaction_giftCardId_fkey"
  FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
