import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';

/**
 * Server file manager. Thin proxy over the node-agent's jailed file manager;
 * relies on the @Global AgentModule (NodeAgentClient) and PrismaModule.
 */
@Module({
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
