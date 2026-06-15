import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ServersService } from './servers.service';
import { ServerResourcesService } from './server-resources.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import {
  AddSubUserDto,
  ChangeMinecraftVersionDto,
  SetMinecraftConfigDto,
  CreateAllocationDto,
  CreateScheduleDto,
  CreateServerDto,
  PowerActionDto,
  ResizeServerDto,
  SendCommandDto,
  SetVariableDto,
  SwitchGameDto,
  UpdateStartupDto,
  UpgradeServerDto,
} from './dto/server.dto';

@ApiTags('servers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('servers')
export class ServersController {
  constructor(
    private readonly servers: ServersService,
    private readonly resources: ServerResourcesService,
  ) {}

  // ---- collection --------------------------------------------------------

  @Get()
  list(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.servers.list(user, pagination);
  }

  @Post()
  @Audit({ action: 'server.create', targetType: 'Server' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateServerDto) {
    return this.servers.create(userId, dto);
  }

  @Get(':serverId')
  @RequirePermissions('server.read')
  get(@Param('serverId') id: string) {
    return this.servers.get(id);
  }

  // ---- lifecycle ---------------------------------------------------------

  @Post(':serverId/power')
  @RequirePermissions('control.power')
  @Audit({ action: 'server.power', targetType: 'Server', targetParam: 'serverId' })
  power(@Param('serverId') id: string, @Body() dto: PowerActionDto) {
    return this.servers.power(id, dto.signal);
  }

  @Post(':serverId/reinstall')
  @RequirePermissions('control.reinstall')
  @Audit({ action: 'server.reinstall', targetType: 'Server', targetParam: 'serverId' })
  reinstall(@Param('serverId') id: string) {
    return this.servers.reinstall(id);
  }

  /** GPortal-style game switch — the signature feature. */
  @Post(':serverId/switch-game')
  @RequirePermissions('control.switch-game')
  @Audit({ action: 'server.switch-game', targetType: 'Server', targetParam: 'serverId' })
  switchGame(
    @Param('serverId') id: string,
    @CurrentUser('id') actorId: string,
    @Body() dto: SwitchGameDto,
  ) {
    return this.servers.switchGame(id, actorId, dto);
  }

  @Get(':serverId/game-history')
  @RequirePermissions('server.read')
  gameHistory(@Param('serverId') id: string) {
    return this.servers.gameHistory(id);
  }

  /** Templates this server may switch to (product whitelist; empty = all). */
  @Get(':id/switch-game/templates')
  @RequirePermissions('server.read')
  switchableTemplates(@Param('id') id: string) {
    return this.servers.switchableTemplates(id);
  }

  // ---- console (one-shot command) ----------------------------------------

  @Post(':id/command')
  @RequirePermissions('console.command')
  @Audit({ action: 'server.command', targetType: 'Server', targetParam: 'id' })
  command(@Param('id') id: string, @Body() dto: SendCommandDto) {
    return this.servers.sendCommand(id, dto.command);
  }

  // ---- startup command ----------------------------------------------------

  @Get(':id/startup')
  @RequirePermissions('startup.update')
  getStartup(@Param('id') id: string) {
    return this.servers.getStartup(id);
  }

  @Put(':id/startup')
  @RequirePermissions('startup.update')
  @Audit({ action: 'server.startup', targetType: 'Server', targetParam: 'id' })
  setStartup(@Param('id') id: string, @Body() dto: UpdateStartupDto) {
    return this.servers.setStartup(id, dto);
  }

  /** Alias for the web client, which PATCHes startup. */
  @Patch(':id/startup')
  @RequirePermissions('startup.update')
  @Audit({ action: 'server.startup', targetType: 'Server', targetParam: 'id' })
  patchStartup(@Param('id') id: string, @Body() dto: UpdateStartupDto) {
    return this.servers.setStartup(id, dto);
  }

  // ---- Minecraft version --------------------------------------------------

  @Patch(':id/minecraft-version')
  @RequirePermissions('startup.update')
  @Audit({
    action: 'server.minecraft-version',
    targetType: 'Server',
    targetParam: 'id',
  })
  changeMinecraftVersion(
    @Param('id') id: string,
    @Body() dto: ChangeMinecraftVersionDto,
  ) {
    return this.servers.changeMinecraftVersion(id, dto.version);
  }

  /** Unified Minecraft egg: set loader + version (+ loader build), then reinstall. */
  @Patch(':id/minecraft')
  @RequirePermissions('startup.update')
  @Audit({
    action: 'server.minecraft-config',
    targetType: 'Server',
    targetParam: 'id',
  })
  setMinecraft(@Param('id') id: string, @Body() dto: SetMinecraftConfigDto) {
    return this.servers.setMinecraftConfig(id, dto);
  }

  // ---- upgrade (resize alias + price preview) ----------------------------

  @Post(':id/upgrade')
  @RequirePermissions('control.resize')
  @Audit({ action: 'server.upgrade', targetType: 'Server', targetParam: 'id' })
  upgrade(@Param('id') id: string, @Body() dto: UpgradeServerDto) {
    return this.servers.upgrade(id, dto);
  }

  @Post(':id/upgrade/preview')
  @RequirePermissions('server.read')
  upgradePreviewPost(@Param('id') id: string, @Body() dto: UpgradeServerDto) {
    return this.servers.upgradePreview(id, dto);
  }

  @Get(':id/upgrade/preview')
  @RequirePermissions('server.read')
  upgradePreviewGet(@Param('id') id: string, @Query() dto: UpgradeServerDto) {
    return this.servers.upgradePreview(id, {
      cpuCores: dto.cpuCores ? Number(dto.cpuCores) : undefined,
      memoryMb: dto.memoryMb ? Number(dto.memoryMb) : undefined,
      diskMb: dto.diskMb ? Number(dto.diskMb) : undefined,
    });
  }

  @Patch(':serverId/resize')
  @RequirePermissions('control.resize')
  @Audit({ action: 'server.resize', targetType: 'Server', targetParam: 'serverId' })
  resize(@Param('serverId') id: string, @Body() dto: ResizeServerDto) {
    return this.servers.resize(id, dto);
  }

  @Post(':serverId/suspend')
  @RequirePermissions('admin.suspend')
  @Audit({ action: 'server.suspend', targetType: 'Server', targetParam: 'serverId' })
  suspend(@Param('serverId') id: string, @Body('reason') reason?: string) {
    return this.servers.suspend(id, reason);
  }

  @Post(':serverId/unsuspend')
  @RequirePermissions('admin.suspend')
  @Audit({ action: 'server.unsuspend', targetType: 'Server', targetParam: 'serverId' })
  unsuspend(@Param('serverId') id: string) {
    return this.servers.unsuspend(id);
  }

  @Delete(':serverId')
  @RequirePermissions('admin.delete')
  @Audit({ action: 'server.delete', targetType: 'Server', targetParam: 'serverId' })
  remove(@Param('serverId') id: string) {
    return this.servers.delete(id);
  }

  // ---- variables ---------------------------------------------------------

  @Get(':serverId/variables')
  @RequirePermissions('server.read')
  listVariables(@Param('serverId') id: string) {
    return this.resources.listVariables(id);
  }

  @Patch(':serverId/variables')
  @RequirePermissions('settings.update')
  setVariable(@Param('serverId') id: string, @Body() dto: SetVariableDto) {
    return this.resources.setVariable(id, dto);
  }

  @Delete(':serverId/variables/:envName')
  @RequirePermissions('settings.update')
  deleteVariable(
    @Param('serverId') id: string,
    @Param('envName') envName: string,
  ) {
    return this.resources.deleteVariable(id, envName);
  }

  // ---- allocations -------------------------------------------------------

  @Get(':serverId/allocations')
  @RequirePermissions('server.read')
  listAllocations(@Param('serverId') id: string) {
    return this.resources.listAllocations(id);
  }

  @Post(':serverId/allocations')
  @RequirePermissions('allocation.create')
  addAllocation(@Param('serverId') id: string, @Body() dto: CreateAllocationDto) {
    return this.resources.addAllocation(id, dto);
  }

  @Delete(':serverId/allocations/:allocationId')
  @RequirePermissions('allocation.delete')
  removeAllocation(
    @Param('serverId') id: string,
    @Param('allocationId') allocationId: string,
  ) {
    return this.resources.removeAllocation(id, allocationId);
  }

  // ---- sub-users ---------------------------------------------------------

  @Get(':serverId/sub-users')
  @RequirePermissions('user.read')
  listSubUsers(@Param('serverId') id: string) {
    return this.resources.listSubUsers(id);
  }

  @Post(':serverId/sub-users')
  @RequirePermissions('user.create')
  addSubUser(@Param('serverId') id: string, @Body() dto: AddSubUserDto) {
    return this.resources.addSubUser(id, dto);
  }

  @Patch(':serverId/sub-users/:subUserId')
  @RequirePermissions('user.update')
  updateSubUser(
    @Param('serverId') id: string,
    @Param('subUserId') subUserId: string,
    @Body('permissions') permissions: string[],
  ) {
    return this.resources.updateSubUser(id, subUserId, permissions);
  }

  @Delete(':serverId/sub-users/:subUserId')
  @RequirePermissions('user.delete')
  revokeSubUser(
    @Param('serverId') id: string,
    @Param('subUserId') subUserId: string,
  ) {
    return this.resources.revokeSubUser(id, subUserId);
  }

  // ---- schedules ---------------------------------------------------------

  @Get(':serverId/schedules')
  @RequirePermissions('server.read')
  listSchedules(@Param('serverId') id: string) {
    return this.resources.listSchedules(id);
  }

  @Post(':serverId/schedules')
  @RequirePermissions('schedule.create')
  createSchedule(@Param('serverId') id: string, @Body() dto: CreateScheduleDto) {
    return this.resources.createSchedule(id, dto);
  }

  @Delete(':serverId/schedules/:scheduleId')
  @RequirePermissions('schedule.delete')
  deleteSchedule(
    @Param('serverId') id: string,
    @Param('scheduleId') scheduleId: string,
  ) {
    return this.resources.deleteSchedule(id, scheduleId);
  }

  @Post(':id/schedules/:scheduleId/run')
  @RequirePermissions('schedule.update')
  @Audit({ action: 'schedule.run', targetType: 'Server', targetParam: 'id' })
  runSchedule(
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
  ) {
    return this.servers.runSchedule(id, scheduleId);
  }
}
