import { Module } from '@nestjs/common';
import { BugsService } from './bugs.service';
import { BugsController } from './bugs.controller';

/**
 * Bug reports: customer submission + the admin triage board. PrismaModule, the
 * auth guards, and PlatformModule (which exports NotificationsService, used to
 * notify staff on a new report) are all @Global, so no imports are needed.
 */
@Module({
  controllers: [BugsController],
  providers: [BugsService],
  exports: [BugsService],
})
export class BugsModule {}
