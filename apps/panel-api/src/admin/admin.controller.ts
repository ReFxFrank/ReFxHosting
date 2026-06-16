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
import {
  BillingInterval,
  CreditReason,
  GlobalRole,
  InvoiceState,
  UserState,
} from '@prisma/client';
import { AdminService } from './admin.service';
import { NodesService } from '../nodes/nodes.service';
import { UsersService } from '../users/users.service';
import { BillingService } from '../billing/billing.service';
import { TemplatesService } from '../templates/templates.service';
import { ServersService } from '../servers/servers.service';
import { AlertsService } from '../platform/alerts.service';
import { HomepageAlertsService } from '../platform/homepage-alerts.service';
import { AuditService } from '../platform/audit.service';
import { SettingsService } from '../platform/settings.service';
import { EmailService } from '../email/email.service';
import { CouponsService } from '../billing/coupons.service';
import { GiftCardsService } from '../billing/gift-cards.service';
import { CreditService } from '../billing/credit.service';
import {
  CreateCouponDto,
  UpdateCouponDto,
} from '../billing/dto/coupon.dto';
import {
  CreateGiftCardDto,
  UpdateGiftCardDto,
} from '../billing/dto/gift-card.dto';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { RequirePerm } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateNodeDto, UpdateNodeDto } from '../nodes/dto/node.dto';
import { CreateLocationDto, UpdateLocationDto } from '../nodes/dto/location.dto';
import { CreateProductDto } from '../billing/dto/create-product.dto';
import {
  CreateProductPriceDto,
  UpdatePriceDto,
} from '../billing/dto/update-price.dto';
import { CreateAlertDto } from '../platform/dto/create-alert.dto';
import {
  CreateHomepageAlertDto,
  UpdateHomepageAlertDto,
} from '../platform/dto/homepage-alert.dto';
import { AuditQueryDto } from '../platform/dto/audit-query.dto';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
} from '../templates/dto/template.dto';
import {
  AdminCreateServerDto,
  CreateRoleDto,
  GrantCreditDto,
  SetEmailConfigDto,
  SetGatewayConfigDto,
  SetUserRoleDto,
  TestEmailDto,
  UpdateAlertDto,
  UpdateProductDto,
  UpdateRoleDto,
  UpdateUserDto,
} from './dto/admin.dto';

/**
 * Admin surface (`/admin/*`). Every route declares the granular permission it
 * needs via @RequirePerm; AdminPermissionGuard enforces it against the caller's
 * effective permissions (their RBAC role, or globalRole defaults). Customers
 * hold no admin permissions, so the whole surface is staff-only.
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminPermissionGuard)
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
    private readonly homepageAlerts: HomepageAlertsService,
    private readonly audit: AuditService,
    private readonly roles: RolesService,
    private readonly settings: SettingsService,
    private readonly email: EmailService,
    private readonly coupons: CouponsService,
    private readonly giftCards: GiftCardsService,
    private readonly credit: CreditService,
  ) {}

  // ---- Coupons -----------------------------------------------------------

  @Get('coupons')
  @RequirePerm('billing.manage')
  listCoupons() {
    return this.coupons.list();
  }

  @Post('coupons')
  @RequirePerm('billing.manage')
  @Audit({ action: 'admin.coupon.create', targetType: 'Coupon' })
  createCoupon(@Body() dto: CreateCouponDto) {
    return this.coupons.create(dto);
  }

  @Patch('coupons/:id')
  @RequirePerm('billing.manage')
  @Audit({ action: 'admin.coupon.update', targetType: 'Coupon', targetParam: 'id' })
  updateCoupon(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return this.coupons.update(id, dto);
  }

  @Delete('coupons/:id')
  @RequirePerm('billing.manage')
  @HttpCode(204)
  @Audit({ action: 'admin.coupon.delete', targetType: 'Coupon', targetParam: 'id' })
  async deleteCoupon(@Param('id') id: string) {
    await this.coupons.remove(id);
  }

  // ---- Gift cards --------------------------------------------------------

  @Get('gift-cards')
  @RequirePerm('billing.manage')
  listGiftCards() {
    return this.giftCards.list();
  }

  @Post('gift-cards')
  @RequirePerm('billing.manage')
  @Audit({ action: 'admin.giftcard.create', targetType: 'GiftCard' })
  createGiftCard(@Body() dto: CreateGiftCardDto) {
    return this.giftCards.create(dto);
  }

  @Patch('gift-cards/:id')
  @RequirePerm('billing.manage')
  @Audit({ action: 'admin.giftcard.update', targetType: 'GiftCard', targetParam: 'id' })
  updateGiftCard(@Param('id') id: string, @Body() dto: UpdateGiftCardDto) {
    return this.giftCards.update(id, dto);
  }

  // ---- Nodes -------------------------------------------------------------

  @Get('nodes')
  @RequirePerm('nodes.read')
  listNodes(@Query() pagination: PaginationDto) {
    return this.nodes.list(pagination);
  }

  @Post('nodes')
  @RequirePerm('nodes.manage')
  @Audit({ action: 'admin.node.create', targetType: 'Node' })
  createNode(@Body() dto: CreateNodeDto) {
    return this.nodes.create(dto);
  }

  // Static route must precede `nodes/:id` so it isn't captured as an id.
  @Get('nodes/regions')
  @RequirePerm('nodes.read')
  listRegions() {
    return this.nodes.listRegions();
  }

  @Get('nodes/:id')
  @RequirePerm('nodes.read')
  getNode(@Param('id') id: string) {
    return this.nodes.get(id);
  }

  @Get('nodes/:id/heartbeats')
  @RequirePerm('nodes.read')
  nodeHeartbeats(@Param('id') id: string, @Query('range') range?: string) {
    return this.nodes.listHeartbeats(id, range ?? '1h');
  }

  @Get('nodes/:id/ping')
  @RequirePerm('nodes.read')
  nodePing(@Param('id') id: string) {
    return this.nodes.ping(id);
  }

  @Post('nodes/:id/restart-agent')
  @RequirePerm('nodes.manage')
  @Audit({ action: 'admin.node.restart-agent', targetType: 'Node', targetParam: 'id' })
  restartNodeAgent(@Param('id') id: string) {
    return this.nodes.restartAgent(id);
  }

  @Patch('nodes/:id')
  @RequirePerm('nodes.manage')
  @Audit({ action: 'admin.node.update', targetType: 'Node', targetParam: 'id' })
  updateNode(@Param('id') id: string, @Body() dto: UpdateNodeDto) {
    return this.nodes.update(id, dto);
  }

  @Delete('nodes/:id')
  @RequirePerm('nodes.manage')
  @HttpCode(204)
  @Audit({ action: 'admin.node.delete', targetType: 'Node', targetParam: 'id' })
  deleteNode(@Param('id') id: string) {
    return this.nodes.delete(id);
  }

  // ---- Locations (regions) ----------------------------------------------

  @Get('locations')
  @RequirePerm('locations.manage')
  listLocations() {
    return this.nodes.listRegions();
  }

  @Post('locations')
  @RequirePerm('locations.manage')
  @Audit({ action: 'admin.location.create', targetType: 'Region' })
  createLocation(@Body() dto: CreateLocationDto) {
    return this.nodes.createRegion(dto);
  }

  @Patch('locations/:id')
  @RequirePerm('locations.manage')
  @Audit({ action: 'admin.location.update', targetType: 'Region', targetParam: 'id' })
  updateLocation(@Param('id') id: string, @Body() dto: UpdateLocationDto) {
    return this.nodes.updateRegion(id, dto);
  }

  @Delete('locations/:id')
  @RequirePerm('locations.manage')
  @HttpCode(204)
  @Audit({ action: 'admin.location.delete', targetType: 'Region', targetParam: 'id' })
  deleteLocation(@Param('id') id: string) {
    return this.nodes.deleteRegion(id);
  }

  // ---- Users -------------------------------------------------------------

  @Get('users')
  @RequirePerm('users.read')
  listUsers(
    @Query() pagination: PaginationDto,
    @Query('role') role?: string,
    @Query('state') state?: string,
  ) {
    return this.users.listUsers(pagination, {
      role: role as GlobalRole | undefined,
      state: state as UserState | undefined,
    });
  }

  @Get('users/:id')
  @RequirePerm('users.read')
  getUser(@Param('id') id: string) {
    // Full account view (profile + billing + servers), secrets stripped.
    return this.admin.userDetail(id);
  }

  @Patch('users/:id')
  @RequirePerm('users.manage')
  @Audit({ action: 'admin.user.update', targetType: 'User', targetParam: 'id' })
  async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    if (dto.state === 'BANNED') return this.users.banUser(id);
    if (dto.state === 'SUSPENDED') return this.users.suspendUser(id);
    if (dto.state === 'ACTIVE') return this.users.reactivateUser(id);
    return this.users.getProfile(id);
  }

  @Patch('users/:id/role')
  @RequirePerm('roles.manage')
  @Audit({ action: 'admin.user.role', targetType: 'User', targetParam: 'id' })
  setUserRole(@Param('id') id: string, @Body() dto: SetUserRoleDto) {
    return this.users.setRole(id, dto.role, dto.roleId);
  }

  @Delete('users/:id')
  @RequirePerm('users.manage')
  @HttpCode(204)
  @Audit({ action: 'admin.user.delete', targetType: 'User', targetParam: 'id' })
  deleteUser(@Param('id') id: string) {
    return this.users.deleteUser(id);
  }

  /** A user's store-credit balance + ledger (admin account view). */
  @Get('users/:id/credit')
  @RequirePerm('users.read')
  async userCredit(@Param('id') id: string) {
    const [balanceMinor, transactions] = await Promise.all([
      this.credit.balance(id),
      this.credit.listTransactions(id),
    ]);
    return { balanceMinor, transactions };
  }

  /** Grant (or deduct, with a negative amount) store credit for a user. */
  @Post('users/:id/credit')
  @HttpCode(200)
  @RequirePerm('users.manage')
  @Audit({ action: 'admin.user.credit', targetType: 'User', targetParam: 'id' })
  grantCredit(
    @Param('id') id: string,
    @Body() dto: GrantCreditDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.credit.adjust(
      id,
      dto.amountMinor,
      dto.reason ?? CreditReason.ADMIN_GRANT,
      { note: dto.note, actorId },
    );
  }

  // ---- Roles & permissions (owner) --------------------------------------

  @Get('roles')
  @RequirePerm('roles.manage')
  listRoles() {
    return this.roles.list();
  }

  @Get('roles/permissions')
  @RequirePerm('roles.manage')
  listPermissions() {
    return this.roles.permissionCatalog();
  }

  @Post('roles')
  @RequirePerm('roles.manage')
  @Audit({ action: 'admin.role.create', targetType: 'Role' })
  createRole(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Patch('roles/:id')
  @RequirePerm('roles.manage')
  @Audit({ action: 'admin.role.update', targetType: 'Role', targetParam: 'id' })
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(id, dto);
  }

  @Delete('roles/:id')
  @RequirePerm('roles.manage')
  @HttpCode(204)
  @Audit({ action: 'admin.role.delete', targetType: 'Role', targetParam: 'id' })
  deleteRole(@Param('id') id: string) {
    return this.roles.remove(id);
  }

  // ---- Billing, orders & invoices ---------------------------------------

  @Get('billing/summary')
  @RequirePerm('billing.read')
  billingSummary() {
    return this.billing.adminBillingSummary();
  }

  /** "Orders" = subscriptions (each is a customer's plan purchase). */
  @Get('orders')
  @RequirePerm('billing.read')
  listOrders(@Query() pagination: PaginationDto) {
    return this.billing.listAllSubscriptions(pagination);
  }

  @Get('invoices')
  @RequirePerm('billing.read')
  listInvoices(@Query() pagination: PaginationDto, @Query('state') state?: string) {
    return this.billing.listAllInvoices(pagination, state as InvoiceState | undefined);
  }

  @Post('invoices/:id/void')
  @RequirePerm('billing.manage')
  @Audit({ action: 'admin.invoice.void', targetType: 'Invoice', targetParam: 'id' })
  voidInvoice(@Param('id') id: string) {
    return this.billing.voidInvoice(id);
  }

  @Delete('invoices/:id')
  @RequirePerm('billing.manage')
  @HttpCode(204)
  @Audit({ action: 'admin.invoice.delete', targetType: 'Invoice', targetParam: 'id' })
  deleteInvoice(@Param('id') id: string) {
    return this.billing.deleteInvoice(id);
  }

  // ---- Payments (owner-only) --------------------------------------------

  @Get('payments')
  @RequirePerm('payments.manage')
  listPayments(@Query() pagination: PaginationDto) {
    return this.billing.listAllPayments(pagination);
  }

  @Get('payments/gateways')
  @RequirePerm('payments.manage')
  paymentGateways() {
    return this.billing.gatewayStatus();
  }

  /** Masked gateway config for the owner editor (no secrets returned). */
  @Get('payments/gateways/config')
  @RequirePerm('payments.manage')
  gatewayConfig() {
    return this.settings.gatewayConfig();
  }

  @Patch('payments/gateways/config')
  @RequirePerm('payments.manage')
  @Audit({ action: 'admin.gateways.update', targetType: 'PlatformSetting' })
  setGatewayConfig(@Body() dto: SetGatewayConfigDto) {
    return this.settings.setGatewayConfig(dto);
  }

  // ---- Email (SMTP) settings --------------------------------------------

  @Get('settings/email')
  @RequirePerm('settings.manage')
  emailConfig() {
    return this.settings.emailConfigMasked();
  }

  @Patch('settings/email')
  @RequirePerm('settings.manage')
  @Audit({ action: 'admin.email.update', targetType: 'PlatformSetting' })
  setEmailConfig(@Body() dto: SetEmailConfigDto) {
    return this.settings.setEmailConfig(dto);
  }

  @Post('settings/email/test')
  @HttpCode(200)
  @RequirePerm('settings.manage')
  @Audit({ action: 'admin.email.test', targetType: 'PlatformSetting' })
  sendTestEmail(@Body() dto: TestEmailDto) {
    return this.email.sendTest(dto.to);
  }

  // ---- Products ----------------------------------------------------------

  @Get('products')
  @RequirePerm('catalog.manage')
  listProducts() {
    return this.billing.listAllProducts();
  }

  @Post('products')
  @RequirePerm('catalog.manage')
  @Audit({ action: 'admin.product.create', targetType: 'Product' })
  createProduct(@Body() dto: CreateProductDto) {
    return this.billing.createProduct(dto);
  }

  @Get('products/:id')
  @RequirePerm('catalog.manage')
  getProduct(@Param('id') id: string) {
    return this.billing.getProduct(id);
  }

  @Patch('products/:id')
  @RequirePerm('catalog.manage')
  @Audit({ action: 'admin.product.update', targetType: 'Product', targetParam: 'id' })
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.billing.updateProduct(id, dto);
  }

  @Delete('products/:id')
  @RequirePerm('catalog.manage')
  @HttpCode(204)
  @Audit({ action: 'admin.product.delete', targetType: 'Product', targetParam: 'id' })
  async deleteProduct(@Param('id') id: string) {
    await this.billing.deleteProduct(id);
  }

  // ---- Prices (per-product, per-interval) -------------------------------

  @Post('products/:id/prices')
  @RequirePerm('catalog.manage')
  @Audit({ action: 'admin.price.create', targetType: 'Product', targetParam: 'id' })
  createPrice(@Param('id') id: string, @Body() dto: CreateProductPriceDto) {
    return this.billing.createPrice({
      productId: id,
      interval: dto.interval ?? BillingInterval.MONTHLY,
      currency: dto.currency,
      amountMinor: dto.amountMinor,
      stripePriceId: dto.stripePriceId,
      isActive: dto.isActive,
    });
  }

  @Patch('prices/:priceId')
  @RequirePerm('catalog.manage')
  @Audit({ action: 'admin.price.update', targetType: 'Price', targetParam: 'priceId' })
  updatePrice(@Param('priceId') priceId: string, @Body() dto: UpdatePriceDto) {
    return this.billing.updatePrice(priceId, dto);
  }

  @Delete('prices/:priceId')
  @RequirePerm('catalog.manage')
  @HttpCode(204)
  @Audit({ action: 'admin.price.delete', targetType: 'Price', targetParam: 'priceId' })
  async deletePrice(@Param('priceId') priceId: string) {
    await this.billing.deletePrice(priceId);
  }

  // ---- Templates (egg editor) -------------------------------------------

  @Get('templates')
  @RequirePerm('catalog.manage')
  listTemplates() {
    return this.templates.list();
  }

  @Post('templates')
  @RequirePerm('catalog.manage')
  @Audit({ action: 'admin.template.create', targetType: 'GameTemplate' })
  createTemplate(@Body() dto: CreateTemplateDto) {
    return this.templates.create(dto);
  }

  @Get('templates/:id')
  @RequirePerm('catalog.manage')
  getTemplate(@Param('id') id: string) {
    return this.templates.get(id);
  }

  @Patch('templates/:id')
  @RequirePerm('catalog.manage')
  @Audit({ action: 'admin.template.update', targetType: 'GameTemplate', targetParam: 'id' })
  updateTemplate(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(id, dto);
  }

  @Delete('templates/:id')
  @RequirePerm('catalog.manage')
  @HttpCode(204)
  @Audit({ action: 'admin.template.delete', targetType: 'GameTemplate', targetParam: 'id' })
  deleteTemplate(@Param('id') id: string) {
    return this.templates.delete(id);
  }

  // ---- Servers (admin create-from-egg) -----------------------------------

  @Get('servers')
  @RequirePerm('servers.read')
  listServers(@Query() pagination: PaginationDto) {
    return this.servers.adminList(pagination);
  }

  @Post('servers')
  @RequirePerm('servers.manage')
  @Audit({ action: 'admin.server.create', targetType: 'Server' })
  createServer(@Body() dto: AdminCreateServerDto) {
    return this.servers.adminCreate(dto);
  }

  @Delete('servers/:id')
  @RequirePerm('servers.manage')
  @HttpCode(204)
  @Audit({ action: 'admin.server.delete', targetType: 'Server', targetParam: 'id' })
  deleteServer(@Param('id') id: string) {
    return this.servers.delete(id);
  }

  // ---- Alerts ------------------------------------------------------------

  @Get('alerts')
  @RequirePerm('content.manage')
  listAlerts() {
    return this.alerts.listAllAlerts();
  }

  @Post('alerts')
  @RequirePerm('content.manage')
  @Audit({ action: 'admin.alert.create', targetType: 'GlobalAlert' })
  createAlert(@Body() dto: CreateAlertDto) {
    return this.alerts.createAlert(dto);
  }

  @Patch('alerts/:id')
  @RequirePerm('content.manage')
  @Audit({ action: 'admin.alert.update', targetType: 'GlobalAlert', targetParam: 'id' })
  updateAlert(@Param('id') id: string, @Body() dto: UpdateAlertDto) {
    return this.alerts.updateAlert(id, dto);
  }

  @Delete('alerts/:id')
  @RequirePerm('content.manage')
  @HttpCode(204)
  @Audit({ action: 'admin.alert.delete', targetType: 'GlobalAlert', targetParam: 'id' })
  deleteAlert(@Param('id') id: string) {
    return this.alerts.deleteAlert(id);
  }

  // ---- Homepage alerts (public storefront notices) -----------------------

  @Get('homepage-alerts')
  @RequirePerm('content.manage')
  listHomepageAlerts() {
    return this.homepageAlerts.listAll();
  }

  @Post('homepage-alerts')
  @RequirePerm('content.manage')
  @Audit({ action: 'admin.homepage-alert.create', targetType: 'HomepageAlert' })
  createHomepageAlert(@Body() dto: CreateHomepageAlertDto) {
    return this.homepageAlerts.create(dto);
  }

  @Patch('homepage-alerts/:id')
  @RequirePerm('content.manage')
  @Audit({
    action: 'admin.homepage-alert.update',
    targetType: 'HomepageAlert',
    targetParam: 'id',
  })
  updateHomepageAlert(
    @Param('id') id: string,
    @Body() dto: UpdateHomepageAlertDto,
  ) {
    return this.homepageAlerts.update(id, dto);
  }

  @Delete('homepage-alerts/:id')
  @RequirePerm('content.manage')
  @HttpCode(204)
  @Audit({
    action: 'admin.homepage-alert.delete',
    targetType: 'HomepageAlert',
    targetParam: 'id',
  })
  deleteHomepageAlert(@Param('id') id: string) {
    return this.homepageAlerts.delete(id);
  }

  // ---- Audit logs --------------------------------------------------------

  @Get('audit-logs')
  @RequirePerm('audit.read')
  auditLogs(@Query() query: AuditQueryDto) {
    return this.audit.listAuditLogs(query);
  }

  // ---- Metrics summary ---------------------------------------------------

  @Get('metrics')
  @RequirePerm('dashboard.read')
  metrics() {
    return this.admin.adminSummary();
  }
}
