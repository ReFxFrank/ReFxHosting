import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiKeyService } from '../auth/api-key.service';
import { resolveClientIp } from '../auth/client-ip.util';

/**
 * Extract the API token from a request: prefer `Authorization: Bearer <token>`
 * (the documented form for machine clients like Helios), fall back to the
 * panel's native `X-Api-Key` header. Returns null when neither is present.
 */
export function extractStatusToken(req: any): string | null {
  const auth = req?.headers?.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const t = auth.slice(7).trim();
    if (t) return t;
  }
  const x = req?.headers?.['x-api-key'];
  if (x) return Array.isArray(x) ? x[0] : x;
  return null;
}

/**
 * Guards the bot-facing `GET /status/nodes` feed. Authenticates the bearer/api
 * token and requires the narrow `STATUS_READ` scope:
 *   - 401 when the token is missing, malformed, invalid, revoked or expired.
 *   - 403 when a valid token lacks the `status:read` scope.
 *
 * The route is marked @Public() so the global JwtAuthGuard skips it (its JWT
 * fallback would reject a bearer-presented `refx_` key); this guard owns auth.
 * It sets `req.statusClient` rather than `req.user`, so a STATUS_READ key never
 * leaks into the RBAC pipeline.
 */
@Injectable()
export class StatusReadGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const token = extractStatusToken(req);
    if (!token) {
      throw new UnauthorizedException('A status:read API token is required');
    }
    // authenticate() throws UnauthorizedException (401) on malformed/invalid/
    // revoked/expired/IP-blocked/inactive — exactly the 401 contract we want.
    const principal = await this.apiKeys.authenticate(token, resolveClientIp(req));
    if (!principal.apiKeyScopes?.includes('STATUS_READ')) {
      throw new ForbiddenException('Token lacks the status:read scope');
    }
    req.statusClient = { apiKeyId: principal.apiKeyId };
    return true;
  }
}

/**
 * Per-token rate limiting for the status feed (~30 req/min/token). Keys the
 * throttler bucket on a hash of the presented token rather than the source IP,
 * so each bot token gets its own budget regardless of shared egress IPs. Falls
 * back to IP for tokenless requests.
 */
@Injectable()
export class StatusTokenThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const token = extractStatusToken(req);
    if (token) {
      return (
        'status-token:' +
        createHash('sha256').update(String(token)).digest('hex').slice(0, 32)
      );
    }
    return (req.ips?.length ? req.ips[0] : req.ip) ?? 'unknown';
  }
}
