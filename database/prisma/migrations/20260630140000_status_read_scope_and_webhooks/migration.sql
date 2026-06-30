-- AlterEnum
ALTER TYPE "ApiKeyScope" ADD VALUE 'STATUS_READ';

-- CreateTable
CREATE TABLE "StatusWebhook" (
    "id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "secretEnc" TEXT NOT NULL,
    "events" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "lastDeliveryAt" TIMESTAMP(3),
    "lastStatus" INTEGER,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatusWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StatusWebhook_isActive_idx" ON "StatusWebhook"("isActive");

