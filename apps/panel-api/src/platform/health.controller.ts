import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

interface HealthResponse {
  status: 'ok';
  uptime: number;
  timestamp: string;
  checks: {
    database: 'up' | 'down';
  };
}

/**
 * Liveness/readiness probe. Registered at the application root (main.ts excludes
 * `health` from the global API prefix), so the path is exactly `/health`.
 */
@ApiTags('platform')
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  async health(): Promise<HealthResponse> {
    let database: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }

    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: { database },
    };
  }
}
