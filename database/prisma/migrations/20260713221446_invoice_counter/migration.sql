-- CreateTable
CREATE TABLE "InvoiceCounter" (
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("year")
);

-- Data backfill (P0-H): seed the per-year counter from existing invoices so that
-- on an already-populated database the first newly-numbered invoice continues
-- the sequence instead of colliding with an already-issued number. `last` is set
-- to the count of that year's invoices, matching the previous COUNT()+1 scheme's
-- last-assigned value. No-op on a fresh database.
INSERT INTO "InvoiceCounter" ("year", "last")
SELECT EXTRACT(YEAR FROM "createdAt")::int AS y, COUNT(*)::int
FROM "Invoice"
GROUP BY EXTRACT(YEAR FROM "createdAt")::int
ON CONFLICT ("year") DO NOTHING;
