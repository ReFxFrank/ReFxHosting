import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { NodesService } from "./nodes.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AdminPermissionGuard } from "../auth/guards/admin-permission.guard";
import { RequirePerm } from "../common/decorators/require-permission.decorator";
import { Audit } from "../common/decorators/audit.decorator";
import { PaginationDto } from "../common/dto/pagination.dto";
import { CreateNodeDto, UpdateNodeDto } from "./dto/node.dto";

@ApiTags("nodes")
@ApiBearerAuth()
// SECURITY (SEC-02): capability-gated, not @Roles(ADMIN). deriveGlobalRole()
// elevates ANY custom role holding a `*.manage` permission to the ADMIN tier,
// so a coarse @Roles(ADMIN) let a scoped staff role (e.g. catalog.manage) reach
// node create/delete + bootstrap-token minting. AdminPermissionGuard checks the
// actual granted capability instead — mirrors the fix already on UsersController.
@UseGuards(JwtAuthGuard, AdminPermissionGuard)
@Controller("nodes")
export class NodesController {
  constructor(private readonly nodes: NodesService) {}

  @Post()
  @RequirePerm("nodes.manage")
  @Audit({ action: "node.create", targetType: "Node" })
  create(@Body() dto: CreateNodeDto) {
    return this.nodes.create(dto);
  }

  @Get()
  @RequirePerm("nodes.read")
  list(@Query() pagination: PaginationDto) {
    return this.nodes.list(pagination);
  }

  @Get(":id")
  @RequirePerm("nodes.read")
  get(@Param("id") id: string) {
    return this.nodes.get(id);
  }

  @Get(":id/capacity")
  @RequirePerm("nodes.read")
  capacity(@Param("id") id: string) {
    return this.nodes.capacity(id);
  }

  @Patch(":id")
  @RequirePerm("nodes.manage")
  @Audit({ action: "node.update", targetType: "Node", targetParam: "id" })
  update(@Param("id") id: string, @Body() dto: UpdateNodeDto) {
    return this.nodes.update(id, dto);
  }

  @Post(":id/maintenance/:state")
  @RequirePerm("nodes.manage")
  @Audit({ action: "node.maintenance", targetType: "Node", targetParam: "id" })
  maintenance(@Param("id") id: string, @Param("state") state: string) {
    return this.nodes.setMaintenance(id, state === "on" || state === "true");
  }

  @Post(":id/bootstrap-token")
  @RequirePerm("nodes.manage")
  @Audit({
    action: "node.bootstrap.rotate",
    targetType: "Node",
    targetParam: "id",
  })
  regenerateBootstrap(@Param("id") id: string) {
    return this.nodes.regenerateBootstrap(id);
  }

  @Delete(":id")
  @RequirePerm("nodes.manage")
  @Audit({ action: "node.delete", targetType: "Node", targetParam: "id" })
  remove(@Param("id") id: string) {
    return this.nodes.delete(id);
  }
}

// NB: the node-agent's inbound surface (register/heartbeat/stats/…) lives at
// /api/v1/agent/* (AgentCallbacksController) — token-gated registration and
// HMAC-signed telemetry. A legacy unauthenticated /nodes/:id/register +
// /nodes/:id/heartbeat surface used to live here; it was removed because the
// agent no longer calls it and unsigned heartbeats could spoof node telemetry.
