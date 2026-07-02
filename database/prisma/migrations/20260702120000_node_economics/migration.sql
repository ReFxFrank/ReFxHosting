-- AlterTable
ALTER TABLE "Node" ADD COLUMN     "costCurrency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "monthlyCostMinor" INTEGER,
ADD COLUMN     "provider" TEXT;
