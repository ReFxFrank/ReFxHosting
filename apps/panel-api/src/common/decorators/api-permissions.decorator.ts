import { SetMetadata } from '@nestjs/common';

export const API_PERMISSIONS_KEY = 'api_key_permissions';

/**
 * Declares the fine-grained permission strings an API KEY must carry (on the key
 * itself — see ApiKey.permissions) to reach a route via the guards' API-key path.
 *
 * This is purely ADDITIVE: it never relaxes the human (JWT) authorization on a
 * route. A human principal has no `apiKeyId`, so it is ignored for them and the
 * existing @Roles / @RequirePermissions checks apply unchanged. An API-key
 * principal that holds ALL of these (in ApiKey.permissions) passes the route even
 * if its user is a plain CUSTOMER — granting a bot least-privilege access without
 * a broad GlobalRole.
 */
export const ApiPermissions = (...perms: string[]) =>
  SetMetadata(API_PERMISSIONS_KEY, perms);
