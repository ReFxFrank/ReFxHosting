-- AlterEnum
ALTER TYPE "CreditReason" ADD VALUE 'REFERRAL';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredById" UUID,
ADD COLUMN     "referralRewardedAt" TIMESTAMP(3),
ADD COLUMN     "attribution" JSONB;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "attribution" JSONB;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "paymentReminderSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
