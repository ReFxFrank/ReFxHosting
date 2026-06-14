import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StatsService } from './stats.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@ApiTags('stats')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('servers/:id/stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  @RequirePermissions('server.read')
  current(@Param('id') id: string) {
    return this.stats.current(id);
  }

  @Get('history')
  @RequirePermissions('server.read')
  history(@Param('id') id: string, @Query('range') range = '1h') {
    return this.stats.history(id, range);
  }
}
