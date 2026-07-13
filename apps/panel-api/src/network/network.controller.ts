import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AdminPermissionGuard } from "../auth/guards/admin-permission.guard";
import { RequirePerm } from "../common/decorators/require-permission.decorator";
import { NetworkService } from "./network.service";

/**
 * Admin Network Status module. Read-only view of panel↔node network health
 * across the fleet — capability-gated on `nodes.read` like the rest of the
 * node surface.
 */
@ApiTags("admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminPermissionGuard)
@Controller("admin/network")
export class NetworkController {
  constructor(private readonly network: NetworkService) {}

  @Get()
  @RequirePerm("nodes.read")
  overview() {
    return this.network.overview();
  }
}
