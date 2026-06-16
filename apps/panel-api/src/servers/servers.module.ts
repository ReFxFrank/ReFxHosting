import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ServersService } from './servers.service';
import { ServerResourcesService } from './server-resources.service';
import { MinecraftResolverService } from './minecraft-resolver.service';
import { ModrinthService } from './modrinth.service';
import { ModsService } from './mods.service';
import { ModpackService } from './modpack.service';
import { WorkshopService } from './workshop.service';
import { ScheduleRunner } from './schedule.runner';
import { ServersController } from './servers.controller';
import { ServersResolver } from './servers.resolver';
import { ModpackProcessor } from '../queues/processors/modpack.processor';
import { NodesModule } from '../nodes/nodes.module';
import { QUEUE } from '../queues/queue.constants';

@Module({
  imports: [
    NodesModule,
    BullModule.registerQueue(
      { name: QUEUE.PROVISIONING },
      { name: QUEUE.REINSTALL },
      { name: QUEUE.SUSPENSION },
      { name: QUEUE.MODPACK },
      { name: QUEUE.BACKUPS },
    ),
  ],
  controllers: [ServersController],
  providers: [
    ServersService,
    ServerResourcesService,
    MinecraftResolverService,
    ModrinthService,
    ModsService,
    ModpackService,
    WorkshopService,
    ModpackProcessor,
    ScheduleRunner,
    ServersResolver,
  ],
  exports: [ServersService],
})
export class ServersModule {}
