import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UsersService } from "./users.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AdminPermissionGuard } from "../auth/guards/admin-permission.guard";
import { PermissionGuard } from "../auth/guards/permission.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePerm } from "../common/decorators/require-permission.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { Audit } from "../common/decorators/audit.decorator";
import { PaginationDto } from "../common/dto/pagination.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { AddSubUserDto } from "./dto/add-sub-user.dto";
import { UpdateSubUserDto } from "./dto/update-sub-user.dto";

@ApiTags("users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // ---- Self-service ------------------------------------------------------

  @Get("me")
  me(@CurrentUser("id") userId: string) {
    return this.users.getProfile(userId);
  }

  @Patch("me")
  @Audit({ action: "user.profile.update", targetType: "User" })
  updateMe(@CurrentUser("id") userId: string, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(userId, dto);
  }

  // ---- Admin -------------------------------------------------------------

  // Gated on the SPECIFIC admin permission, not a coarse global-role tier.
  // Previously these used @Roles(ADMIN); because deriveGlobalRole() elevates any
  // `*.manage` custom role to the ADMIN tier, a scoped role (e.g. catalog.manage)
  // could ban/suspend arbitrary users. AdminPermissionGuard checks the actual
  // granted permission instead. Listing needs only read; lifecycle needs manage.
  @Get()
  @UseGuards(AdminPermissionGuard)
  @RequirePerm("users.read")
  list(@Query() pagination: PaginationDto) {
    return this.users.listUsers(pagination);
  }

  @Post(":id/ban")
  @HttpCode(200)
  @UseGuards(AdminPermissionGuard)
  @RequirePerm("users.manage")
  @Audit({ action: "user.ban", targetType: "User", targetParam: "id" })
  ban(@Param("id") id: string, @CurrentUser("id") actorId: string) {
    return this.users.banUser(id, actorId);
  }

  @Post(":id/suspend")
  @HttpCode(200)
  @UseGuards(AdminPermissionGuard)
  @RequirePerm("users.manage")
  @Audit({ action: "user.suspend", targetType: "User", targetParam: "id" })
  suspend(@Param("id") id: string, @CurrentUser("id") actorId: string) {
    return this.users.suspendUser(id, actorId);
  }

  @Post(":id/reactivate")
  @HttpCode(200)
  @UseGuards(AdminPermissionGuard)
  @RequirePerm("users.manage")
  @Audit({ action: "user.reactivate", targetType: "User", targetParam: "id" })
  reactivate(@Param("id") id: string) {
    return this.users.reactivateUser(id);
  }
}

/**
 * Sub-user management is scoped to a server and authorized per-server via
 * PermissionGuard (owner / platform admin / holder of the required permission).
 */
@ApiTags("sub-users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("servers/:serverId/sub-users")
export class SubUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions("user.read")
  list(@Param("serverId") serverId: string) {
    return this.users.listSubUsers(serverId);
  }

  @Post()
  @RequirePermissions("user.create")
  @Audit({
    action: "server.subuser.add",
    targetType: "Server",
    targetParam: "serverId",
  })
  add(@Param("serverId") serverId: string, @Body() dto: AddSubUserDto) {
    return this.users.addSubUser(serverId, dto);
  }

  @Patch(":subUserId")
  @RequirePermissions("user.update")
  @Audit({
    action: "server.subuser.update",
    targetType: "Server",
    targetParam: "serverId",
  })
  update(
    @Param("serverId") serverId: string,
    @Param("subUserId") subUserId: string,
    @Body() dto: UpdateSubUserDto,
  ) {
    return this.users.updateSubUserPermissions(
      serverId,
      subUserId,
      dto.permissions,
    );
  }

  @Delete(":subUserId")
  @HttpCode(200)
  @RequirePermissions("user.delete")
  @Audit({
    action: "server.subuser.revoke",
    targetType: "Server",
    targetParam: "serverId",
  })
  revoke(
    @Param("serverId") serverId: string,
    @Param("subUserId") subUserId: string,
  ) {
    return this.users.revokeSubUser(serverId, subUserId);
  }
}
