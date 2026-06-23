-- Staged plan changes: upgrades are gated on payment of an invoice (the server
-- stays on its old configuration until paid); downgrades apply at the next
-- renewal. At most one pending change per subscription.

-- CreateTable
CREATE TABLE "PendingPlanChange" (
    "id" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "invoiceId" UUID,
    "applyAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "priceId" UUID NOT NULL,
    "hardwareTierId" UUID,
    "slots" INTEGER NOT NULL,
    "cpuCores" DOUBLE PRECISION NOT NULL,
    "memoryMb" INTEGER NOT NULL,
    "diskMb" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingPlanChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingPlanChange_subscriptionId_key" ON "PendingPlanChange"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingPlanChange_invoiceId_key" ON "PendingPlanChange"("invoiceId");

-- AddForeignKey
ALTER TABLE "PendingPlanChange" ADD CONSTRAINT "PendingPlanChange_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingPlanChange" ADD CONSTRAINT "PendingPlanChange_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
