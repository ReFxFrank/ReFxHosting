-- Admin-only, Pterodactyl-style server transfer between nodes. The ServerTransfer
-- row tracks the orchestration (snapshot on source → provision on dest → restore →
-- repoint → delete source); terminal states are SUCCEEDED / FAILED.

-- CreateEnum
CREATE TYPE "TransferState" AS ENUM ('PENDING', 'SNAPSHOTTING', 'PROVISIONING', 'RESTORING', 'FINALIZING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "ServerTransfer" (
    "id" UUID NOT NULL,
    "serverId" UUID NOT NULL,
    "fromNodeId" UUID NOT NULL,
    "toNodeId" UUID NOT NULL,
    "backupId" UUID,
    "state" "TransferState" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServerTransfer_serverId_idx" ON "ServerTransfer"("serverId");

-- CreateIndex
CREATE INDEX "ServerTransfer_state_idx" ON "ServerTransfer"("state");

-- AddForeignKey
ALTER TABLE "ServerTransfer" ADD CONSTRAINT "ServerTransfer_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
