import { Prisma, Server } from "@prisma/client";

/**
 * Secret Server columns that must never be echoed to API clients (the schema
 * documents the Steam password as "never returned to the client"). Passed as a
 * Prisma `omit` on every query whose row — or an object embedding it — is
 * returned from a route, so the columns are stripped in the database layer
 * instead of relying on serialization. The values are ciphertext at rest
 * (except steamUsername), so this is defense-in-depth, not an active leak.
 *
 * Internal consumers that legitimately need the secrets (install-spec builder,
 * SFTP auth, transfers, install processors) run their own queries and are
 * unaffected — only add this to client-facing reads/updates.
 */
export const SERVER_SECRET_OMIT = {
  sftpPasswordEnc: true,
  steamUsername: true,
  steamPasswordEnc: true,
  steamGuardCode: true,
} as const satisfies Prisma.ServerOmit;

/** A Server row with the secret columns stripped — the shape routes return. */
export type PublicServer = Omit<Server, keyof typeof SERVER_SECRET_OMIT>;

/**
 * The only Node columns allowed to ride on customer-facing server payloads —
 * exactly the web's declared `Pick<Node, "id" | "name" | "fqdn" | "regionId">`
 * (apps/web/lib/types.ts). The full Node row carries control-plane material
 * (tokenHash, agentCertPem/agentCertSha256, agent scheme+daemonPort, bootstrap
 * token lifecycle) and internal ops config (capacity, overcommit, provider,
 * hardware cost) that must never reach customers. Internal agent-call paths
 * fetch their own full node row and are unaffected — apply this only where the
 * node is embedded in a response.
 */
export const NODE_PUBLIC_SELECT = {
  id: true,
  name: true,
  fqdn: true,
  regionId: true,
} as const satisfies Prisma.NodeSelect;

/** The node shape embedded in customer-facing server payloads. */
export type PublicNode = Prisma.NodeGetPayload<{
  select: typeof NODE_PUBLIC_SELECT;
}>;
