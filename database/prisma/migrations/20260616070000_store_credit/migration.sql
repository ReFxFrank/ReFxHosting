-- Per-user store credit.
CREATE TYPE "CreditReason" AS ENUM ('ADMIN_GRANT', 'REFUND', 'GIFT_CARD', 'INVOICE_PAYMENT', 'ADJUSTMENT');

ALTER TABLE "User" ADD COLUMN "creditBalanceMinor" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "CreditTransaction" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "reason" "CreditReason" NOT NULL DEFAULT 'ADJUSTMENT',
  "note" TEXT,
  "invoiceId" UUID,
  "actorId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CreditTransaction_userId_idx" ON "CreditTransaction"("userId");
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
