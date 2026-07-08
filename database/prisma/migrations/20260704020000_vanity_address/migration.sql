-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "vanityLabel" TEXT;

-- CreateTable
CREATE TABLE "PendingVanityAddress" (
    "id" UUID NOT NULL,
    "serverId" UUID NOT NULL,
    "invoiceId" UUID,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingVanityAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Server_vanityLabel_key" ON "Server"("vanityLabel");

-- CreateIndex
CREATE UNIQUE INDEX "PendingVanityAddress_serverId_key" ON "PendingVanityAddress"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingVanityAddress_invoiceId_key" ON "PendingVanityAddress"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingVanityAddress_label_key" ON "PendingVanityAddress"("label");

-- AddForeignKey
ALTER TABLE "PendingVanityAddress" ADD CONSTRAINT "PendingVanityAddress_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingVanityAddress" ADD CONSTRAINT "PendingVanityAddress_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
