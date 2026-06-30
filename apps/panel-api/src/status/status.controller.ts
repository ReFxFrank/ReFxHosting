import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiSecurity,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import {
  StatusService,
  SystemStatus,
  NodeStatusResponse,
} from './status.service';
import { StatusReadGuard, StatusTokenThrottlerGuard } from './status-read.guard';

/**
 * Public, unauthenticated platform status feed for the storefront `/status`
 * page. Returns only aggregated region-level health — no node detail/secrets.
 *
 * `GET /status/nodes` is the additive, bot-scoped sibling: it returns the same
 * region/node rollups ENRICHED with optional per-node live metrics, gated on a
 * `status:read` API token. The public `GET /status` shape is unchanged.
 */
@ApiTags('status')
@Controller('status')
export class StatusController {
  constructor(private readonly status: StatusService) {}

  @Public()
  @Get()
  get(): Promise<SystemStatus> {
    return this.status.getStatus();
  }

  /**
   * Bot-facing per-node live metrics (CPU / RAM / disk / running servers).
   * Requires a `status:read`-scoped token presented as `Authorization: Bearer`
   * or `X-Api-Key`. Rate-limited to ~30 req/min/token. 401 without a valid
   * token, 403 when the token lacks the scope.
   */
  @Public()
  @Get('nodes')
  @UseGuards(StatusTokenThrottlerGuard, StatusReadGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiSecurity('status-token')
  @ApiOperation({
    summary: 'Per-node live metrics (requires a status:read token)',
    description:
      'Region/node rollups enriched with optional per-node CPU/RAM/disk and ' +
      'running-server counts. Auth: a status:read API token via Authorization: ' +
      'Bearer <token> or X-Api-Key. Limited to ~30 requests/minute/token.',
  })
  @ApiOkResponse({ description: 'Enriched per-node metrics, wrapped in { success, data }.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, revoked or expired token.' })
  @ApiForbiddenResponse({ description: 'Token does not carry the status:read scope.' })
  getNodes(): Promise<NodeStatusResponse> {
    return this.status.getNodes();
  }
}
