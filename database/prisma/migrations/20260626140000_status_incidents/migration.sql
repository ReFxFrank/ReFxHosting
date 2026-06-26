-- Operator-posted status incidents shown on the public /status page, with a
-- timeline of updates. While unresolved, an incident drives the displayed
-- status of its affected components.

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "IncidentImpact" AS ENUM ('MAINTENANCE', 'DEGRADED', 'OUTAGE');

-- CreateTable
CREATE TABLE "StatusIncident" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'INVESTIGATING',
    "impact" "IncidentImpact" NOT NULL DEFAULT 'DEGRADED',
    "components" TEXT[],
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatusIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusIncidentUpdate" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "status" "IncidentStatus" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusIncidentUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StatusIncident_resolvedAt_idx" ON "StatusIncident"("resolvedAt");

-- CreateIndex
CREATE INDEX "StatusIncidentUpdate_incidentId_idx" ON "StatusIncidentUpdate"("incidentId");

-- AddForeignKey
ALTER TABLE "StatusIncidentUpdate" ADD CONSTRAINT "StatusIncidentUpdate_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "StatusIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
