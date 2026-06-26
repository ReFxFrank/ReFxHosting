import { Module } from '@nestjs/common';
import { SupportService } from './support.service';
import { SupportController } from './support.controller';
import { SupportResolver } from './support.resolver';
import { SupportScheduler } from './support.scheduler';

/**
 * Support / helpdesk feature module: tickets, canned responses, knowledge base
 * and ticket categories. PrismaModule and AuthModule (guards) are @Global, so
 * no extra imports are required here. SupportScheduler auto-resolves/closes
 * stale tickets on a cron (ScheduleModule is registered in AppModule).
 */
@Module({
  controllers: [SupportController],
  providers: [SupportService, SupportResolver, SupportScheduler],
  exports: [SupportService],
})
export class SupportModule {}
