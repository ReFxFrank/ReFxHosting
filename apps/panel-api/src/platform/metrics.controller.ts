import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { RawResponse } from '../common/decorators/raw-response.decorator';
import { MetricsService } from './metrics.service';

/**
 * Prometheus scrape endpoint. Registered at the application root (main.ts
 * excludes `metrics` from the global API prefix) and marked @RawResponse() so
 * the `{ success, data }` transform interceptor leaves the exposition text alone.
 */
@ApiTags('platform')
@Controller()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Public()
  @RawResponse()
  @Get('metrics')
  async scrape(@Res({ passthrough: true }) res: Response): Promise<string> {
    res.setHeader('Content-Type', this.metrics.contentType);
    return this.metrics.getMetrics();
  }
}
