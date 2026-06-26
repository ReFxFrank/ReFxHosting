import { Module } from '@nestjs/common';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';

/** Public platform-status feed (derived from node health). */
@Module({
  controllers: [StatusController],
  providers: [StatusService],
})
export class StatusModule {}
