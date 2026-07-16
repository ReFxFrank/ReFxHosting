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
