import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ServersService } from './servers.service';
import { ServerResourcesService } from './server-resources.service';
import { ServersController } from './servers.controller';
import { ServersResolver } from './servers.resolver';
import { NodesModule } from '../nodes/nodes.module';
import { QUEUE } from '../queues/queue.constants';

@Module({
  imports: [
    NodesModule,
    BullModule.registerQueue(
      { name: QUEUE.PROVISIONING },
      { name: QUEUE.REINSTALL },
      { name: QUEUE.SUSPENSION },
    ),
  ],
  controllers: [ServersController],
  providers: [ServersService, ServerResourcesService, ServersResolver],
  exports: [ServersService],
})
export class ServersModule {}
