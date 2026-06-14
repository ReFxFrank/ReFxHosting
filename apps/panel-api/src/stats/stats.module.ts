import { Module } from '@nestjs/common';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';

/**
 * Server resource stats: live snapshot via the @Global NodeAgentClient, history
 * from persisted ServerStat rows.
 */
@Module({
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
