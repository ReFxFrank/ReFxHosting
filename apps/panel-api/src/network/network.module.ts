import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { NodesModule } from "../nodes/nodes.module";
import { RedisService } from "../common/redis/redis.service";
import { NetworkService } from "./network.service";
import { NetworkController } from "./network.controller";

/**
 * Panel-side network monitoring: a cron sweep records per-node probe samples in
 * Redis and the admin Network Status module reads the derived metrics.
 */
@Module({
  imports: [PrismaModule, NodesModule],
  controllers: [NetworkController],
  providers: [NetworkService, RedisService],
})
export class NetworkModule {}
