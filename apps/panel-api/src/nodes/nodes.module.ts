import { Module } from "@nestjs/common";
import { NodesService } from "./nodes.service";
import { NodesController } from "./nodes.controller";
import { NodesResolver } from "./nodes.resolver";
import { NodesScheduler } from "./nodes.scheduler";

@Module({
  controllers: [NodesController],
  providers: [NodesService, NodesResolver, NodesScheduler],
  exports: [NodesService],
})
export class NodesModule {}
