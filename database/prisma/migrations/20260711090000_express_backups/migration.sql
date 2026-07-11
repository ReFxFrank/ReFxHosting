-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "expressBackups" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "expressBackups" BOOLEAN NOT NULL DEFAULT false;
