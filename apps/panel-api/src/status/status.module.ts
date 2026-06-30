import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';
import { StatusReadGuard, StatusTokenThrottlerGuard } from './status-read.guard';

/**
 * Public platform-status feed (derived from node health) plus the bot-scoped
 * `GET /status/nodes` metrics endpoint. AuthModule is imported for ApiKeyService
 * (used by StatusReadGuard to authenticate status:read tokens).
 */
@Module({
  imports: [AuthModule],
  controllers: [StatusController],
  providers: [StatusService, StatusReadGuard, StatusTokenThrottlerGuard],
  exports: [StatusService],
})
export class StatusModule {}
