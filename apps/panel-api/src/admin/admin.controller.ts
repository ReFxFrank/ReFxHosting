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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GlobalRole } from '@prisma/client';
import { AdminService } from './admin.service';
import { NodesService } from '../nodes/nodes.service';
import { UsersService } from '../users/users.service';
import { BillingService } from '../billing/billing.service';
import { TemplatesService } from '../templates/templates.service';
import { ServersService } from '../servers/servers.service';
import { AlertsService } from '../platform/alerts.service';
import { AuditService } from '../platform/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateNodeDto, UpdateNodeDto } from '../nodes/dto/node.dto';
import { CreateProductDto } from '../billing/dto/create-product.dto';
import { CreateAlertDto } from '../platform/dto/create-alert.dto';
import { AuditQueryDto } from '../platform/dto/audit-query.dto';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
} from '../templates/dto/template.dto';
import {
  AdminCreateServerDto,
  UpdateAlertDto,
  UpdateProductDto,
  UpdateUserDto,
} from './dto/admin.dto';

/**
 * Admin surface (`/admin/*`). Mostly thin aliases over existing feature services;
 * the whole controller is ADMIN/OWNER-gated. The "egg editor" template CRUD and
 * the JSON metrics summary are the only non-alias additions.
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(GlobalRole.ADMIN, GlobalRole.OWNER)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly nodes: NodesService,
    private readonly users: UsersService,
    private readonly billing: BillingService,
    private readonly templates: TemplatesService,
    private readonly servers: ServersService,
    private readonly alerts: AlertsService,
    private readonly audit: AuditService,
  ) {}

  // ---- Nodes -------------------------------------------------------------

  @Get('nodes')
  listNodes(@Query() pagination: PaginationDto) {
    return this.nodes.list(pagination);
  }

  @Post('nodes')
  @Audit({ action: 'admin.node.create', targetType: 'Node' })
  createNode(@Body() dto: CreateNodeDto) {
    return this.nodes.create(dto);
  }

  @Get('nodes/:id')
  getNode(@Param('id') id: string) {
    return this.nodes.get(id);
  }

  @Get('nodes/:id/heartbeats')
  nodeHeartbeats(@Param('id') id: string, @Query('range') range?: string) {
    return this.nodes.listHeartbeats(id, range ?? '1h');
  }

  @Patch('nodes/:id')
  @Audit({ action: 'admin.node.update', targetType: 'Node', targetParam: 'id' })
  updateNode(@Param('id') id: string, @Body() dto: UpdateNodeDto) {
    return this.nodes.update(id, dto);
  }

  @Delete('nodes/:id')
  @HttpCode(204)
  @Audit({ action: 'admin.node.delete', targetType: 'Node', targetParam: 'id' })
  deleteNode(@Param('id') id: string) {
    return this.nodes.delete(id);
  }

  // ---- Users -------------------------------------------------------------

  @Get('users')
  listUsers(@Query() pagination: PaginationDto) {
    return this.users.listUsers(pagination);
  }

  @Get('users/:id')
  getUser(@Param('id') id: string) {
    return this.users.getProfile(id);
  }

  @Patch('users/:id')
  @Audit({ action: 'admin.user.update', targetType: 'User', targetParam: 'id' })
  async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    if (dto.state === 'BANNED') return this.users.banUser(id);
    if (dto.state === 'SUSPENDED') return this.users.suspendUser(id);
    if (dto.state === 'ACTIVE') return this.users.reactivateUser(id);
    return this.users.getProfile(id);
  }

  // ---- Products ----------------------------------------------------------

  @Get('products')
  listProducts() {
    return this.billing.listAllProducts();
  }

  @Post('products')
  @Audit({ action: 'admin.product.create', targetType: 'Product' })
  createProduct(@Body() dto: CreateProductDto) {
    return this.billing.createProduct(dto);
  }

  @Get('products/:id')
  getProduct(@Param('id') id: string) {
    return this.billing.getProduct(id);
  }

  @Patch('products/:id')
  @Audit({ action: 'admin.product.update', targetType: 'Product', targetParam: 'id' })
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.billing.updateProduct(id, dto);
  }

  @Delete('products/:id')
  @HttpCode(204)
  @Audit({ action: 'admin.product.delete', targetType: 'Product', targetParam: 'id' })
  async deleteProduct(@Param('id') id: string) {
    await this.billing.deleteProduct(id);
  }

  // ---- Templates (egg editor) -------------------------------------------

  @Get('templates')
  listTemplates() {
    return this.templates.list();
  }

  @Post('templates')
  @Audit({ action: 'admin.template.create', targetType: 'GameTemplate' })
  createTemplate(@Body() dto: CreateTemplateDto) {
    return this.templates.create(dto);
  }

  @Get('templates/:id')
  getTemplate(@Param('id') id: string) {
    return this.templates.get(id);
  }

  @Patch('templates/:id')
  @Audit({ action: 'admin.template.update', targetType: 'GameTemplate', targetParam: 'id' })
  updateTemplate(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(id, dto);
  }

  @Delete('templates/:id')
  @HttpCode(204)
  @Audit({ action: 'admin.template.delete', targetType: 'GameTemplate', targetParam: 'id' })
  deleteTemplate(@Param('id') id: string) {
    return this.templates.delete(id);
  }

  // ---- Servers (admin create-from-egg) -----------------------------------

  @Get('servers')
  listServers(@Query() pagination: PaginationDto) {
    return this.servers.adminList(pagination);
  }

  @Post('servers')
  @Audit({ action: 'admin.server.create', targetType: 'Server' })
  createServer(@Body() dto: AdminCreateServerDto) {
    return this.servers.adminCreate(dto);
  }

  @Delete('servers/:id')
  @HttpCode(204)
  @Audit({ action: 'admin.server.delete', targetType: 'Server', targetParam: 'id' })
  deleteServer(@Param('id') id: string) {
    return this.servers.delete(id);
  }

  // ---- Alerts ------------------------------------------------------------

  @Get('alerts')
  listAlerts() {
    return this.alerts.listAllAlerts();
  }

  @Post('alerts')
  @Audit({ action: 'admin.alert.create', targetType: 'GlobalAlert' })
  createAlert(@Body() dto: CreateAlertDto) {
    return this.alerts.createAlert(dto);
  }

  @Patch('alerts/:id')
  @Audit({ action: 'admin.alert.update', targetType: 'GlobalAlert', targetParam: 'id' })
  updateAlert(@Param('id') id: string, @Body() dto: UpdateAlertDto) {
    return this.alerts.updateAlert(id, dto);
  }

  @Delete('alerts/:id')
  @HttpCode(204)
  @Audit({ action: 'admin.alert.delete', targetType: 'GlobalAlert', targetParam: 'id' })
  deleteAlert(@Param('id') id: string) {
    return this.alerts.deleteAlert(id);
  }

  // ---- Audit logs --------------------------------------------------------

  @Get('audit-logs')
  auditLogs(@Query() query: AuditQueryDto) {
    return this.audit.listAuditLogs(query);
  }

  // ---- Metrics summary ---------------------------------------------------

  @Get('metrics')
  metrics() {
    return this.admin.adminSummary();
  }
}
