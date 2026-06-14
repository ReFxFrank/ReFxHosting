import { Module } from '@nestjs/common';
import { NodesService } from './nodes.service';
import { NodesController, NodeAgentController } from './nodes.controller';
import { NodesResolver } from './nodes.resolver';

@Module({
  controllers: [NodesController, NodeAgentController],
  providers: [NodesService, NodesResolver],
  exports: [NodesService],
})
export class NodesModule {}
