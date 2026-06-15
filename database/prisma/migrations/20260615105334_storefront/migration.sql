-- CreateEnum
CREATE TYPE "HomepageAlertType" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'DANGER', 'PROMO');

-- AlterTable
ALTER TABLE "GameTemplate" ADD COLUMN     "cardImageUrl" TEXT,
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "heroImageUrl" TEXT,
ADD COLUMN     "iconUrl" TEXT,
ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "longDescription" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "HomepageAlert" (
    "id" UUID NOT NULL,
    "type" "HomepageAlertType" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "dismissible" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomepageAlert_pkey" PRIMARY KEY ("id")
);

