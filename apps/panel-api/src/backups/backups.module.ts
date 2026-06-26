import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BackupsService } from './backups.service';
import { BackupsController } from './backups.controller';
import { QUEUE } from '../queues/queue.constants';

/**
 * Server backups: Backup rows + agent calls. Enqueues onto the shared BACKUPS
 * queue (consumed by QueuesModule's BackupsProcessor).
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE.BACKUPS })],
  controllers: [BackupsController],
  providers: [BackupsService],
  exports: [BackupsService],
})
export class BackupsModule {}
