import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { StatusService, SystemStatus } from './status.service';

/**
 * Public, unauthenticated platform status feed for the storefront `/status`
 * page. Returns only aggregated region-level health — no node detail/secrets.
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
}
