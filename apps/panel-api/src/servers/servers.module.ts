import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ServersService } from "./servers.service";
import { ServerResourcesService } from "./server-resources.service";
import { MinecraftResolverService } from "./minecraft-resolver.service";
import { ModrinthService } from "./modrinth.service";
import { ModsService } from "./mods.service";
import { ModpackService } from "./modpack.service";
import { WorldRecoveryService } from "./world-recovery.service";
import { WorkshopService } from "./workshop.service";
import { VoiceService } from "./voice.service";
import { ScheduleRunner } from "./schedule.runner";
import { LifecycleReconciler } from "./lifecycle-reconciler.service";
import { TransfersService } from "./transfers.service";
import { DomainsService } from "./domains.service";
import { ServersController } from "./servers.controller";
import { ServersResolver } from "./servers.resolver";
import { ModpackProcessor } from "../queues/processors/modpack.processor";
import { TransferProcessor } from "../queues/processors/transfer.processor";
import { NodesModule } from "../nodes/nodes.module";
import { BillingModule } from "../billing/billing.module";
import { BackupsModule } from "../backups/backups.module";
import { QUEUE } from "../queues/queue.constants";

@Module({
  imports: [
    NodesModule,
    BillingModule,
    BackupsModule,
    BullModule.registerQueue(
      { name: QUEUE.PROVISIONING },
      { name: QUEUE.REINSTALL },
      { name: QUEUE.SUSPENSION },
      { name: QUEUE.MODPACK },
      { name: QUEUE.BACKUPS },
      { name: QUEUE.TRANSFER },
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
    WorldRecoveryService,
    WorkshopService,
    VoiceService,
    ModpackProcessor,
    TransferProcessor,
    TransfersService,
    ScheduleRunner,
    LifecycleReconciler,
    DomainsService,
    ServersResolver,
  ],
  exports: [ServersService, TransfersService],
})
export class ServersModule {}
