-- Optional wildcard "game domain" per node for branded per-server connection
-- addresses (GPortal-style). When set (e.g. "fra.refx.gg") with a matching
-- wildcard DNS record, new servers get an allocation alias "<shortId>.<gameDomain>"
-- shown to customers instead of the raw node IP.

-- AlterTable
ALTER TABLE "Node" ADD COLUMN "gameDomain" TEXT;
