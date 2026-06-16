-- Pinned agent TLS cert (PEM + SHA-256) for panel->agent certificate pinning.
ALTER TABLE "Node" ADD COLUMN "agentCertPem" TEXT;
ALTER TABLE "Node" ADD COLUMN "agentCertSha256" TEXT;
