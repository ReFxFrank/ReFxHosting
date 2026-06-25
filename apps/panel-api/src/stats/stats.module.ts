import { Module } from '@nestjs/common';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';
import { TelemetryRetentionScheduler } from './telemetry-retention.scheduler';

/**
 * Server resource stats: live snapshot via the @Global NodeAgentClient, history
 * from persisted ServerStat rows. Also hosts the nightly telemetry prune that
 * caps ServerStat / NodeHeartbeat growth.
 */
@Module({
  controllers: [StatsController],
  providers: [StatsService, TelemetryRetentionScheduler],
})
export class StatsModule {}
