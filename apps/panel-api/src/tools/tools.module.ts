import { Module } from "@nestjs/common";
import { MinecraftPingService } from "./minecraft-ping.service";
import { ToolsController } from "./tools.controller";

/** Public marketing utilities (see ToolsController). */
@Module({
  controllers: [ToolsController],
  providers: [MinecraftPingService],
})
export class ToolsModule {}
