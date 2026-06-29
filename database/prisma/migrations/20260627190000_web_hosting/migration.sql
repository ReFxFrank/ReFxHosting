-- CreateEnum
CREATE TYPE "TemplateKind" AS ENUM ('GAME', 'WEB');

-- CreateEnum
CREATE TYPE "SslStatus" AS ENUM ('PENDING', 'ACTIVE', 'FAILED');

-- AlterEnum
ALTER TYPE "ServerType" ADD VALUE 'WEB_APP';

-- AlterEnum
ALTER TYPE "ProductType" ADD VALUE 'WEB_HOSTING';

-- AlterTable
ALTER TABLE "GameTemplate" ADD COLUMN     "kind" "TemplateKind" NOT NULL DEFAULT 'GAME';

-- CreateTable
CREATE TABLE "Domain" (
    "id" UUID NOT NULL,
    "serverId" UUID NOT NULL,
    "hostname" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sslStatus" "SslStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Domain_hostname_key" ON "Domain"("hostname");

-- CreateIndex
CREATE INDEX "Domain_serverId_idx" ON "Domain"("serverId");

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

