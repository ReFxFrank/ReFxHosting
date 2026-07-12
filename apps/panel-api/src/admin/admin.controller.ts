import {
  BadRequestException,
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
import { BillingInterval, CreditReason } from "@prisma/client";
import { AdminService } from "./admin.service";
import { NodesService } from "../nodes/nodes.service";
import { UsersService } from "../users/users.service";
import { BillingService } from "../billing/billing.service";
import { TemplatesService } from "../templates/templates.service";
import { ServersService } from "../servers/servers.service";
import { BackupsService } from "../backups/backups.service";
import { TransfersService } from "../servers/transfers.service";
import { DatabaseHostsService } from "../databases/database-hosts.service";
import { VanityAddressService } from "../servers/vanity-address.service";
import { ResizeServerDto } from "../servers/dto/server.dto";
import {
  CreateDatabaseHostDto,
  UpdateDatabaseHostDto,
} from "../databases/dto/databases.dto";
import { AlertsService } from "../platform/alerts.service";
import { HomepageAlertsService } from "../platform/homepage-alerts.service";
import { IncidentsService } from "../platform/incidents.service";
import { WebhooksService } from "../webhooks/webhooks.service";
import {
  CreateStatusWebhookDto,
  UpdateStatusWebhookDto,
} from "../webhooks/dto/webhook.dto";
import { AuthService } from "../auth/auth.service";
import {
  CreateIncidentDto,
  UpdateIncidentDto,
  AddIncidentUpdateDto,
} from "../platform/dto/incident.dto";
import { StaffService } from "../platform/staff.service";
import {
  CreateStaffMemberDto,
  UpdateStaffMemberDto,
} from "../platform/dto/staff.dto";
import { AuditService } from "../platform/audit.service";
import { SettingsService } from "../platform/settings.service";
import { EmailService } from "../email/email.service";
import { CouponsService } from "../billing/coupons.service";
import { GiftCardsService } from "../billing/gift-cards.service";
import { CreditService } from "../billing/credit.service";
import { CreateCouponDto, UpdateCouponDto } from "../billing/dto/coupon.dto";
import {
  CreateGiftCardDto,
  UpdateGiftCardDto,
} from "../billing/dto/gift-card.dto";
import { RolesService } from "./roles.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AdminPermissionGuard } from "../auth/guards/admin-permission.guard";
import { RequirePerm } from "../common/decorators/require-permission.decorator";
import {
  CurrentUser,
  AuthUser,
} from "../common/decorators/current-user.decorator";
import { Audit } from "../common/decorators/audit.decorator";
import { PaginationDto } from "../common/dto/pagination.dto";
import { ListUsersQueryDto } from "../users/dto/list-users-query.dto";
import { ListInvoicesQueryDto } from "../billing/dto/list-invoices-query.dto";
import {
  CreateNodeDto,
  UpdateNodeDto,
  UpdateAgentsDto,
} from "../nodes/dto/node.dto";
import {
  CreateLocationDto,
  UpdateLocationDto,
} from "../nodes/dto/location.dto";
import { CreateProductDto } from "../billing/dto/create-product.dto";
import {
  CreateProductPriceDto,
  UpdatePriceDto,
} from "../billing/dto/update-price.dto";
import {
  CreateHardwareTierDto,
  UpdateHardwareTierDto,
} from "../billing/dto/hardware-tier.dto";
import { CreateAlertDto } from "../platform/dto/create-alert.dto";
import {
  CreateHomepageAlertDto,
  UpdateHomepageAlertDto,
} from "../platform/dto/homepage-alert.dto";
import { AuditQueryDto } from "../platform/dto/audit-query.dto";
import {
  CreateTemplateDto,
  UpdateTemplateDto,
} from "../templates/dto/template.dto";
import {
  AdminCreateServerDto,
  BulkIdsDto,
  RefundInvoiceDto,
  CreateRoleDto,
  AdminCreateUserDto,
  GrantCreditDto,
  SetEmailConfigDto,
  SetGatewayConfigDto,
  SetSteamConfigDto,
  SetVanityConfigDto,
  SetExpressBackupsConfigDto,
  SetBackupStorageDto,
  SetReferralConfigDto,
  VerifySteamLoginDto,
  SetUserPasswordDto,
  SetUserRoleDto,
  TestEmailDto,
  TransferServerDto,
  UpdateAlertDto,
  UpdateProductDto,
  UpdateRoleDto,
  UpdateUserDto,
} from "./dto/admin.dto";

/**
 * Admin surface (`/admin/*`). Every route declares the granular permission it
 * needs via @RequirePerm; AdminPermissionGuard enforces it against the caller's
 * effective permissions (their RBAC role, or globalRole defaults). Customers
 * hold no admin permissions, so the whole surface is staff-only.
 */
@ApiTags("admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminPermissionGuard)
@Controller("admin")
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly nodes: NodesService,
    private readonly users: UsersService,
    private readonly billing: BillingService,
    private readonly templates: TemplatesService,
    private readonly servers: ServersService,
    private readonly backupsService: BackupsService,
    private readonly transfers: TransfersService,
    private readonly alerts: AlertsService,
    private readonly homepageAlerts: HomepageAlertsService,
    private readonly incidents: IncidentsService,
    private readonly webhooks: WebhooksService,
    private readonly auth: AuthService,
    private readonly staff: StaffService,
    private readonly audit: AuditService,
    private readonly roles: RolesService,
    private readonly settings: SettingsService,
    private readonly email: EmailService,
    private readonly coupons: CouponsService,
    private readonly giftCards: GiftCardsService,
    private readonly credit: CreditService,
    private readonly dbHosts: DatabaseHostsService,
    private readonly vanity: VanityAddressService,
  ) {}

  // ---- Coupons -----------------------------------------------------------

  @Get("coupons")
  @RequirePerm("billing.manage")
  listCoupons() {
    return this.coupons.list();
  }

  @Post("coupons")
  @RequirePerm("billing.manage")
  @Audit({ action: "admin.coupon.create", targetType: "Coupon" })
  createCoupon(@Body() dto: CreateCouponDto) {
    return this.coupons.create(dto);
  }

  @Patch("coupons/:id")
  @RequirePerm("billing.manage")
  @Audit({
    action: "admin.coupon.update",
    targetType: "Coupon",
    targetParam: "id",
  })
  updateCoupon(@Param("id") id: string, @Body() dto: UpdateCouponDto) {
    return this.coupons.update(id, dto);
  }

  @Delete("coupons/:id")
  @RequirePerm("billing.manage")
  @HttpCode(204)
  @Audit({
    action: "admin.coupon.delete",
    targetType: "Coupon",
    targetParam: "id",
  })
  async deleteCoupon(@Param("id") id: string) {
    await this.coupons.remove(id);
  }

  // ---- Gift cards --------------------------------------------------------

  @Get("gift-cards")
  @RequirePerm("billing.manage")
  listGiftCards() {
    return this.giftCards.list();
  }

  @Post("gift-cards")
  @RequirePerm("billing.manage")
  @Audit({ action: "admin.giftcard.create", targetType: "GiftCard" })
  createGiftCard(@Body() dto: CreateGiftCardDto) {
    return this.giftCards.create(dto);
  }

  @Patch("gift-cards/:id")
  @RequirePerm("billing.manage")
  @Audit({
    action: "admin.giftcard.update",
    targetType: "GiftCard",
    targetParam: "id",
  })
  updateGiftCard(@Param("id") id: string, @Body() dto: UpdateGiftCardDto) {
    return this.giftCards.update(id, dto);
  }

  // ---- Nodes -------------------------------------------------------------

  @Get("nodes")
  @RequirePerm("nodes.read")
  listNodes(@Query() pagination: PaginationDto) {
    return this.nodes.list(pagination);
  }

  @Post("nodes")
  @RequirePerm("nodes.manage")
  @Audit({ action: "admin.node.create", targetType: "Node" })
  createNode(@Body() dto: CreateNodeDto) {
    return this.nodes.create(dto);
  }

  // Static route must precede `nodes/:id` so it isn't captured as an id.
  @Get("nodes/regions")
  @RequirePerm("nodes.read")
  listRegions() {
    return this.nodes.listRegions();
  }

  /** Latest published agent release tag (for the "update available" badge).
   *  Static route — must precede `nodes/:id`. */
  @Get("nodes/agent-latest")
  @RequirePerm("nodes.read")
  async agentLatestVersion() {
    return { latest: await this.nodes.latestAgentVersion() };
  }

  /** Fleet backup-storage stats: offsite usage/cost vs add-on revenue. */
  @Get("backups/stats")
  @RequirePerm("nodes.read")
  backupStats() {
    return this.backupsService.adminStats();
  }

  /** Portfolio margin view: per-node cost vs. estimated revenue + break-even.
   *  Static route — must precede `nodes/:id`. */
  @Get("nodes/economics")
  @RequirePerm("nodes.read")
  nodeEconomics() {
    return this.nodes.economics();
  }

  @Get("nodes/:id")
  @RequirePerm("nodes.read")
  getNode(@Param("id") id: string) {
    return this.nodes.get(id);
  }

  @Get("nodes/:id/heartbeats")
  @RequirePerm("nodes.read")
  nodeHeartbeats(@Param("id") id: string, @Query("range") range?: string) {
    return this.nodes.listHeartbeats(id, range ?? "1h");
  }

  @Get("nodes/:id/ping")
  @RequirePerm("nodes.read")
  nodePing(@Param("id") id: string) {
    return this.nodes.ping(id);
  }

  @Post("nodes/:id/restart-agent")
  @RequirePerm("nodes.manage")
  @Audit({
    action: "admin.node.restart-agent",
    targetType: "Node",
    targetParam: "id",
  })
  restartNodeAgent(@Param("id") id: string) {
    return this.nodes.restartAgent(id);
  }

  /** Wipe the node's cached steamcmd sessions (after changing a Steam account). */
  @Post("nodes/:id/steam-cache/clear")
  @HttpCode(200)
  @RequirePerm("nodes.manage")
  @Audit({
    action: "admin.node.steam-cache.clear",
    targetType: "Node",
    targetParam: "id",
  })
  clearNodeSteamCache(@Param("id") id: string) {
    return this.nodes.clearSteamCache(id);
  }

  /** Self-update the node agent to the latest published release (no SSH). */
  @Post("nodes/:id/update-agent")
  @HttpCode(200)
  @RequirePerm("nodes.manage")
  @Audit({
    action: "admin.node.update-agent",
    targetType: "Node",
    targetParam: "id",
  })
  updateNodeAgent(@Param("id") id: string) {
    return this.nodes.updateAgent(id);
  }

  /** Self-update every node's agent to the latest release (or the given ids). */
  @Post("nodes/update-all-agents")
  @HttpCode(200)
  @RequirePerm("nodes.manage")
  @Audit({ action: "admin.node.update-all-agents", targetType: "Node" })
  updateAllNodeAgents(@Body() dto: UpdateAgentsDto) {
    return this.nodes.updateAllAgents(dto.ids);
  }

  /** Pin (trust-on-first-use) the node agent's current TLS certificate. */
  @Post("nodes/:id/pin-cert")
  @HttpCode(200)
  @RequirePerm("nodes.manage")
  @Audit({
    action: "admin.node.pin-cert",
    targetType: "Node",
    targetParam: "id",
  })
  pinNodeCert(@Param("id") id: string) {
    return this.nodes.pinAgentCert(id);
  }

  @Delete("nodes/:id/pin-cert")
  @HttpCode(204)
  @RequirePerm("nodes.manage")
  @Audit({
    action: "admin.node.unpin-cert",
    targetType: "Node",
    targetParam: "id",
  })
  unpinNodeCert(@Param("id") id: string) {
    return this.nodes.unpinAgentCert(id);
  }

  /**
   * Rotate the node's bootstrap token: mints a fresh single-use, time-boxed
   * token and clears the used marker so the agent can (re)register. The old
   * token is immediately invalidated. Returns the new plaintext once.
   */
  @Post("nodes/:id/bootstrap-token")
  @HttpCode(200)
  @RequirePerm("nodes.manage")
  @Audit({
    action: "admin.node.bootstrap.rotate",
    targetType: "Node",
    targetParam: "id",
  })
  regenerateNodeBootstrap(@Param("id") id: string) {
    return this.nodes.regenerateBootstrap(id);
  }

  @Patch("nodes/:id")
  @RequirePerm("nodes.manage")
  @Audit({ action: "admin.node.update", targetType: "Node", targetParam: "id" })
  updateNode(@Param("id") id: string, @Body() dto: UpdateNodeDto) {
    return this.nodes.update(id, dto);
  }

  @Delete("nodes/:id")
  @RequirePerm("nodes.manage")
  @HttpCode(204)
  @Audit({ action: "admin.node.delete", targetType: "Node", targetParam: "id" })
  deleteNode(@Param("id") id: string) {
    return this.nodes.delete(id);
  }

  // ---- Locations (regions) ----------------------------------------------

  @Get("locations")
  @RequirePerm("locations.manage")
  listLocations() {
    return this.nodes.listRegions();
  }

  @Post("locations")
  @RequirePerm("locations.manage")
  @Audit({ action: "admin.location.create", targetType: "Region" })
  createLocation(@Body() dto: CreateLocationDto) {
    return this.nodes.createRegion(dto);
  }

  @Patch("locations/:id")
  @RequirePerm("locations.manage")
  @Audit({
    action: "admin.location.update",
    targetType: "Region",
    targetParam: "id",
  })
  updateLocation(@Param("id") id: string, @Body() dto: UpdateLocationDto) {
    return this.nodes.updateRegion(id, dto);
  }

  @Delete("locations/:id")
  @RequirePerm("locations.manage")
  @HttpCode(204)
  @Audit({
    action: "admin.location.delete",
    targetType: "Region",
    targetParam: "id",
  })
  deleteLocation(@Param("id") id: string) {
    return this.nodes.deleteRegion(id);
  }

  // ---- Users -------------------------------------------------------------

  @Get("users")
  @RequirePerm("users.read")
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.users.listUsers(query, {
      role: query.role,
      state: query.state,
    });
  }

  /**
   * Create an account (e.g. a test/reviewer login for the iOS app). ACTIVE +
   * email-verified by default so it can sign in immediately. Returns the
   * password ONCE. Can only create accounts below your own privilege level.
   */
  @Post("users")
  @RequirePerm("users.create")
  @Audit({ action: "admin.user.create", targetType: "User" })
  createUser(
    @CurrentUser() actor: AuthUser,
    @Body() dto: AdminCreateUserDto,
  ): Promise<{ id: string; email: string; password: string }> {
    return this.auth.adminCreateUser(actor, dto);
  }

  /** Paying customers — accounts with an ACTIVE subscription backed by a PAID invoice. */
  @Get("customers")
  @RequirePerm("users.read")
  listCustomers(@Query() pagination: PaginationDto) {
    return this.admin.listCustomers(pagination);
  }

  @Get("users/:id")
  @RequirePerm("users.read")
  getUser(@Param("id") id: string) {
    // Full account view (profile + billing + servers), secrets stripped.
    return this.admin.userDetail(id);
  }

  @Patch("users/:id")
  @RequirePerm("users.suspend")
  @Audit({ action: "admin.user.update", targetType: "User", targetParam: "id" })
  async updateUser(@Param("id") id: string, @Body() dto: UpdateUserDto) {
    if (dto.state === "BANNED") return this.users.banUser(id);
    if (dto.state === "SUSPENDED") return this.users.suspendUser(id);
    if (dto.state === "ACTIVE") return this.users.reactivateUser(id);
    return this.users.getProfile(id);
  }

  /** Manually mark a user's email verified (stand-in until SMTP is configured). */
  @Post("users/:id/verify-email")
  @HttpCode(200)
  @RequirePerm("users.verify-email")
  @Audit({
    action: "admin.user.verify-email",
    targetType: "User",
    targetParam: "id",
  })
  verifyUserEmail(@Param("id") id: string) {
    return this.users.markEmailVerified(id);
  }

  @Patch("users/:id/role")
  @RequirePerm("roles.manage")
  @Audit({ action: "admin.user.role", targetType: "User", targetParam: "id" })
  setUserRole(@Param("id") id: string, @Body() dto: SetUserRoleDto) {
    return this.users.setRole(id, dto.role, dto.roleId);
  }

  @Delete("users/:id")
  @RequirePerm("users.delete")
  @HttpCode(204)
  @Audit({ action: "admin.user.delete", targetType: "User", targetParam: "id" })
  deleteUser(@Param("id") id: string) {
    return this.users.deleteUser(id);
  }

  /** GDPR erasure: anonymize personal data + remove auth material (keeps invoices). */
  @Post("users/:id/purge")
  @HttpCode(204)
  @RequirePerm("users.delete")
  @Audit({ action: "admin.user.purge", targetType: "User", targetParam: "id" })
  purgeUser(@Param("id") id: string) {
    return this.users.purgeUser(id);
  }

  /** Email the user a password-reset link (admin never sees the password). */
  @Post("users/:id/send-password-reset")
  @HttpCode(200)
  @RequirePerm("users.password")
  @Audit({
    action: "admin.user.password.send-reset",
    targetType: "User",
    targetParam: "id",
  })
  async sendUserPasswordReset(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
  ): Promise<{ sent: true }> {
    await this.auth.adminSendPasswordReset(actor, id);
    return { sent: true };
  }

  /**
   * Set a temporary password (forces a change on next login, revokes sessions).
   * Returns the password ONCE so the admin can relay it. Omit the body to
   * auto-generate a strong password.
   */
  @Post("users/:id/set-password")
  @HttpCode(200)
  @RequirePerm("users.password")
  @Audit({
    action: "admin.user.password.set-temporary",
    targetType: "User",
    targetParam: "id",
  })
  setUserPassword(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() dto: SetUserPasswordDto,
  ): Promise<{ password: string }> {
    return this.auth.adminSetPassword(actor, id, dto.password);
  }

  /** A user's store-credit balance + ledger (admin account view). */
  @Get("users/:id/credit")
  @RequirePerm("users.read")
  async userCredit(@Param("id") id: string) {
    const [balanceMinor, transactions] = await Promise.all([
      this.credit.balance(id),
      this.credit.listTransactions(id),
    ]);
    return { balanceMinor, transactions };
  }

  /** Grant (or deduct, with a negative amount) store credit for a user. */
  @Post("users/:id/credit")
  @HttpCode(200)
  @RequirePerm("users.credit")
  @Audit({ action: "admin.user.credit", targetType: "User", targetParam: "id" })
  grantCredit(
    @Param("id") id: string,
    @Body() dto: GrantCreditDto,
    @CurrentUser("id") actorId: string,
  ) {
    return this.credit.adjust(
      id,
      dto.amountMinor,
      dto.reason ?? CreditReason.ADMIN_GRANT,
      { note: dto.note, actorId },
    );
  }

  // ---- Roles & permissions (owner) --------------------------------------

  @Get("roles")
  @RequirePerm("roles.manage")
  listRoles() {
    return this.roles.list();
  }

  @Get("roles/permissions")
  @RequirePerm("roles.manage")
  listPermissions() {
    return this.roles.permissionCatalog();
  }

  @Post("roles")
  @RequirePerm("roles.manage")
  @Audit({ action: "admin.role.create", targetType: "Role" })
  createRole(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Patch("roles/:id")
  @RequirePerm("roles.manage")
  @Audit({ action: "admin.role.update", targetType: "Role", targetParam: "id" })
  updateRole(@Param("id") id: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(id, dto);
  }

  @Delete("roles/:id")
  @RequirePerm("roles.manage")
  @HttpCode(204)
  @Audit({ action: "admin.role.delete", targetType: "Role", targetParam: "id" })
  deleteRole(@Param("id") id: string) {
    return this.roles.remove(id);
  }

  // ---- Database hosts (shared MySQL/MariaDB for per-server databases) -----

  @Get("database-hosts")
  @RequirePerm("nodes.read")
  listDatabaseHosts() {
    return this.dbHosts.list();
  }

  @Post("database-hosts")
  @RequirePerm("nodes.manage")
  @Audit({ action: "admin.dbhost.create", targetType: "DatabaseHost" })
  createDatabaseHost(@Body() dto: CreateDatabaseHostDto) {
    return this.dbHosts.create(dto);
  }

  @Patch("database-hosts/:id")
  @RequirePerm("nodes.manage")
  @Audit({
    action: "admin.dbhost.update",
    targetType: "DatabaseHost",
    targetParam: "id",
  })
  updateDatabaseHost(
    @Param("id") id: string,
    @Body() dto: UpdateDatabaseHostDto,
  ) {
    return this.dbHosts.update(id, dto);
  }

  @Delete("database-hosts/:id")
  @RequirePerm("nodes.manage")
  @HttpCode(204)
  @Audit({
    action: "admin.dbhost.delete",
    targetType: "DatabaseHost",
    targetParam: "id",
  })
  async deleteDatabaseHost(@Param("id") id: string) {
    await this.dbHosts.remove(id);
  }

  /** Verify the admin connection to a host works. */
  @Post("database-hosts/:id/test")
  @HttpCode(200)
  @RequirePerm("nodes.manage")
  testDatabaseHost(@Param("id") id: string) {
    return this.dbHosts.test(id);
  }

  // ---- Billing, orders & invoices ---------------------------------------

  @Get("billing/summary")
  @RequirePerm("billing.read")
  billingSummary() {
    return this.billing.adminBillingSummary();
  }

  /** Acquisition channels: signups, payers and revenue by first-touch source. */
  @Get("growth")
  @RequirePerm("billing.read")
  growth(@Query("days") days?: string) {
    const parsed = Number(days);
    return this.admin.growthReport(Number.isFinite(parsed) && parsed > 0 ? parsed : 30);
  }

  /** "Orders" = subscriptions (each is a customer's plan purchase). */
  @Get("orders")
  @RequirePerm("billing.read")
  listOrders(@Query() pagination: PaginationDto) {
    return this.billing.listAllSubscriptions(pagination);
  }

  /** Bulk-delete orders (must precede `orders/:id` so it isn't read as an id). */
  @Post("orders/bulk-delete")
  @RequirePerm("billing.manage")
  @HttpCode(200)
  @Audit({ action: "admin.order.bulk-delete", targetType: "Subscription" })
  bulkDeleteOrders(@Body() dto: BulkIdsDto) {
    return this.billing.deleteSubscriptions(dto.ids);
  }

  @Delete("orders/:id")
  @RequirePerm("billing.manage")
  @HttpCode(204)
  @Audit({
    action: "admin.order.delete",
    targetType: "Subscription",
    targetParam: "id",
  })
  async deleteOrder(@Param("id") id: string) {
    await this.billing.deleteSubscription(id);
  }

  @Get("invoices")
  @RequirePerm("billing.read")
  listInvoices(@Query() query: ListInvoicesQueryDto) {
    return this.billing.listAllInvoices(query, query.state);
  }

  /** Bulk-delete invoices (must precede `invoices/:id` routes). */
  @Post("invoices/bulk-delete")
  @RequirePerm("billing.manage")
  @HttpCode(200)
  @Audit({ action: "admin.invoice.bulk-delete", targetType: "Invoice" })
  bulkDeleteInvoices(@Body() dto: BulkIdsDto) {
    return this.billing.deleteInvoices(dto.ids);
  }

  @Post("invoices/:id/void")
  @RequirePerm("billing.manage")
  @Audit({
    action: "admin.invoice.void",
    targetType: "Invoice",
    targetParam: "id",
  })
  voidInvoice(@Param("id") id: string) {
    return this.billing.voidInvoice(id);
  }

  /** Manually settle an open invoice (e.g. off-platform payment received). */
  @Post("invoices/:id/mark-paid")
  @HttpCode(200)
  @RequirePerm("billing.manage")
  @Audit({
    action: "admin.invoice.mark-paid",
    targetType: "Invoice",
    targetParam: "id",
  })
  markInvoicePaid(@Param("id") id: string) {
    return this.billing.markInvoiceManuallyPaid(id);
  }

  /** Refund a paid invoice back to the customer's payment method (full or partial). */
  @Post("invoices/:id/refund")
  @HttpCode(200)
  @RequirePerm("billing.refund")
  @Audit({
    action: "admin.invoice.refund",
    targetType: "Invoice",
    targetParam: "id",
  })
  refundInvoice(
    @Param("id") id: string,
    @Body() dto: RefundInvoiceDto,
    @CurrentUser("id") actorId: string,
  ) {
    return this.billing.refundInvoice(id, dto.amountMinor, actorId);
  }

  @Delete("invoices/:id")
  @RequirePerm("billing.manage")
  @HttpCode(204)
  @Audit({
    action: "admin.invoice.delete",
    targetType: "Invoice",
    targetParam: "id",
  })
  deleteInvoice(@Param("id") id: string) {
    return this.billing.deleteInvoice(id);
  }

  // ---- Payments (owner-only) --------------------------------------------

  @Get("payments")
  @RequirePerm("payments.manage")
  listPayments(@Query() pagination: PaginationDto) {
    return this.billing.listAllPayments(pagination);
  }

  @Get("payments/gateways")
  @RequirePerm("payments.manage")
  paymentGateways() {
    return this.billing.gatewayStatus();
  }

  /** Masked gateway config for the owner editor (no secrets returned). */
  @Get("payments/gateways/config")
  @RequirePerm("payments.manage")
  gatewayConfig() {
    return this.settings.gatewayConfig();
  }

  @Patch("payments/gateways/config")
  @RequirePerm("payments.manage")
  @Audit({ action: "admin.gateways.update", targetType: "PlatformSetting" })
  setGatewayConfig(@Body() dto: SetGatewayConfigDto) {
    return this.settings.setGatewayConfig(dto);
  }

  // ---- Email (SMTP) settings --------------------------------------------

  @Get("settings/email")
  @RequirePerm("settings.manage")
  emailConfig() {
    return this.settings.emailConfigMasked();
  }

  @Patch("settings/email")
  @RequirePerm("settings.manage")
  @Audit({ action: "admin.email.update", targetType: "PlatformSetting" })
  setEmailConfig(@Body() dto: SetEmailConfigDto) {
    return this.settings.setEmailConfig(dto);
  }

  @Post("settings/email/test")
  @HttpCode(200)
  @RequirePerm("settings.manage")
  @Audit({ action: "admin.email.test", targetType: "PlatformSetting" })
  sendTestEmail(@Body() dto: TestEmailDto) {
    return this.email.sendTest(dto.to);
  }

  // ---- Custom server addresses (vanity labels) ---------------------------

  @Get("settings/vanity")
  @RequirePerm("settings.manage")
  vanityConfig() {
    return this.settings.vanityConfig();
  }

  @Patch("settings/vanity")
  @RequirePerm("settings.manage")
  @Audit({ action: "admin.settings.vanity.update", targetType: "PlatformSetting" })
  async setVanityConfig(@Body() dto: SetVanityConfigDto) {
    await this.settings.setVanityConfig(dto);
    return this.settings.vanityConfig();
  }

  // ---- Referral program ----------------------------------------------------

  @Get("settings/referrals")
  @RequirePerm("settings.manage")
  referralConfig() {
    return this.settings.referralConfig();
  }

  @Patch("settings/referrals")
  @RequirePerm("settings.manage")
  @Audit({
    action: "admin.settings.referrals.update",
    targetType: "PlatformSetting",
  })
  async setReferralConfig(@Body() dto: SetReferralConfigDto) {
    await this.settings.setReferralConfig(dto);
    return this.settings.referralConfig();
  }

  // ---- Centrally-managed backup storage (S3/R2) ---------------------------

  @Get("settings/backup-storage")
  @RequirePerm("settings.manage")
  backupStorageConfig() {
    return this.settings.backupStorageConfigMasked();
  }

  /** Save the S3/R2 credentials and push them to every node in one action. */
  @Patch("settings/backup-storage")
  @RequirePerm("settings.manage")
  @Audit({
    action: "admin.settings.backupStorage.update",
    targetType: "PlatformSetting",
  })
  async setBackupStorageConfig(@Body() dto: SetBackupStorageDto) {
    await this.settings.setBackupStorageConfig(dto);
    const s3 = await this.settings.backupStorageConfig();
    const push = await this.nodes.broadcastBackupStorage(s3);
    return {
      config: await this.settings.backupStorageConfigMasked(),
      push,
    };
  }

  /** Re-push the saved credentials (e.g. after bringing a node online). */
  @Post("settings/backup-storage/push")
  @RequirePerm("settings.manage")
  @Audit({
    action: "admin.settings.backupStorage.push",
    targetType: "PlatformSetting",
  })
  async pushBackupStorage() {
    const s3 = await this.settings.backupStorageConfig();
    return { push: await this.nodes.broadcastBackupStorage(s3) };
  }

  // ---- Express backups (offsite storage add-on) ---------------------------

  @Get("settings/express-backups")
  @RequirePerm("settings.manage")
  expressBackupsConfig() {
    return this.settings.expressBackupsConfig();
  }

  @Patch("settings/express-backups")
  @RequirePerm("settings.manage")
  @Audit({
    action: "admin.settings.expressBackups.update",
    targetType: "PlatformSetting",
  })
  async setExpressBackupsConfig(@Body() dto: SetExpressBackupsConfigDto) {
    await this.settings.setExpressBackupsConfig(dto);
    return this.settings.expressBackupsConfig();
  }

  /** ToS/impersonation enforcement: strip a purchased address (optional credit). */
  @Delete("servers/:id/vanity-address")
  @RequirePerm("servers.manage")
  @Audit({
    action: "admin.server.vanity.remove",
    targetType: "Server",
    targetParam: "id",
  })
  adminRemoveVanity(
    @Param("id") id: string,
    @Query("refund") refund: string | undefined,
    @CurrentUser("id") actorId: string,
  ) {
    return this.vanity.adminRemove(id, {
      refundCredit: refund === "credit",
      actorId,
    });
  }

  // ---- Steam (central SteamCMD login + Web API key) ----------------------

  @Get("settings/steam")
  @RequirePerm("settings.manage")
  steamConfig() {
    return this.settings.steamConfigMasked();
  }

  @Patch("settings/steam")
  @RequirePerm("settings.manage")
  @Audit({ action: "admin.steam.update", targetType: "PlatformSetting" })
  setSteamConfig(@Body() dto: SetSteamConfigDto) {
    return this.settings.setSteamConfig(dto);
  }

  /**
   * Verify + cache the game-download Steam login on a node: pre-warms steamcmd
   * then logs in NOW (while a fresh Guard code is valid), so owned-game installs
   * (Arma 3, DayZ, …) need no further code. Uses the saved username/password plus
   * the provided (or staged) Guard code; clears the staged code on success.
   */
  @Post("settings/steam/verify")
  @HttpCode(200)
  @RequirePerm("settings.manage")
  @Audit({ action: "admin.steam.verify", targetType: "Node" })
  async verifySteamLogin(
    @Body() dto: VerifySteamLoginDto,
  ): Promise<{ ok: boolean; output: string }> {
    const cfg = await this.settings.steamConfig();
    if (!cfg.username || !cfg.password) {
      throw new BadRequestException(
        "Set the Steam username and password first (and save), then verify.",
      );
    }
    const guard = dto.guardCode?.trim() || cfg.guardCode || undefined;
    const res = await this.nodes.verifySteamLogin(dto.nodeId, {
      username: cfg.username,
      password: cfg.password,
      guard,
    });
    // A used code is consumed whether or not it succeeded (it's one-time anyway).
    if (guard) await this.settings.consumeSteamGuardCode();
    return res;
  }

  // ---- Products ----------------------------------------------------------

  @Get("products")
  @RequirePerm("catalog.read")
  listProducts() {
    return this.billing.listAllProducts();
  }

  @Post("products")
  @RequirePerm("catalog.manage")
  @Audit({ action: "admin.product.create", targetType: "Product" })
  createProduct(@Body() dto: CreateProductDto) {
    return this.billing.createProduct(dto);
  }

  @Get("products/:id")
  @RequirePerm("catalog.read")
  getProduct(@Param("id") id: string) {
    return this.billing.getProduct(id);
  }

  @Patch("products/:id")
  @RequirePerm("catalog.manage")
  @Audit({
    action: "admin.product.update",
    targetType: "Product",
    targetParam: "id",
  })
  updateProduct(@Param("id") id: string, @Body() dto: UpdateProductDto) {
    return this.billing.updateProduct(id, dto);
  }

  @Delete("products/:id")
  @RequirePerm("catalog.manage")
  @HttpCode(204)
  @Audit({
    action: "admin.product.delete",
    targetType: "Product",
    targetParam: "id",
  })
  async deleteProduct(@Param("id") id: string) {
    await this.billing.deleteProduct(id);
  }

  // ---- Prices (per-product, per-interval) -------------------------------

  @Post("products/:id/prices")
  @RequirePerm("catalog.manage")
  @Audit({
    action: "admin.price.create",
    targetType: "Product",
    targetParam: "id",
  })
  createPrice(@Param("id") id: string, @Body() dto: CreateProductPriceDto) {
    return this.billing.createPrice({
      productId: id,
      interval: dto.interval ?? BillingInterval.MONTHLY,
      currency: dto.currency,
      amountMinor: dto.amountMinor,
      stripePriceId: dto.stripePriceId,
      isActive: dto.isActive,
    });
  }

  @Patch("prices/:priceId")
  @RequirePerm("catalog.manage")
  @Audit({
    action: "admin.price.update",
    targetType: "Price",
    targetParam: "priceId",
  })
  updatePrice(@Param("priceId") priceId: string, @Body() dto: UpdatePriceDto) {
    return this.billing.updatePrice(priceId, dto);
  }

  @Delete("prices/:priceId")
  @RequirePerm("catalog.manage")
  @HttpCode(204)
  @Audit({
    action: "admin.price.delete",
    targetType: "Price",
    targetParam: "priceId",
  })
  async deletePrice(@Param("priceId") priceId: string) {
    await this.billing.deletePrice(priceId);
  }

  // ---- Hardware tiers (game packages: Low/Mid/High) ----------------------

  @Post("products/:id/tiers")
  @RequirePerm("catalog.manage")
  @Audit({
    action: "admin.tier.create",
    targetType: "Product",
    targetParam: "id",
  })
  createTier(@Param("id") id: string, @Body() dto: CreateHardwareTierDto) {
    return this.billing.createTier(id, dto);
  }

  @Patch("tiers/:tierId")
  @RequirePerm("catalog.manage")
  @Audit({
    action: "admin.tier.update",
    targetType: "HardwareTier",
    targetParam: "tierId",
  })
  updateTier(
    @Param("tierId") tierId: string,
    @Body() dto: UpdateHardwareTierDto,
  ) {
    return this.billing.updateTier(tierId, dto);
  }

  @Delete("tiers/:tierId")
  @RequirePerm("catalog.manage")
  @HttpCode(204)
  @Audit({
    action: "admin.tier.delete",
    targetType: "HardwareTier",
    targetParam: "tierId",
  })
  async deleteTier(@Param("tierId") tierId: string) {
    await this.billing.deleteTier(tierId);
  }

  /** Create a price scoped to a hardware tier. */
  @Post("products/:id/tiers/:tierId/prices")
  @RequirePerm("catalog.manage")
  @Audit({
    action: "admin.price.create",
    targetType: "HardwareTier",
    targetParam: "tierId",
  })
  createTierPrice(
    @Param("id") id: string,
    @Param("tierId") tierId: string,
    @Body() dto: CreateProductPriceDto,
  ) {
    return this.billing.createPrice({
      productId: id,
      hardwareTierId: tierId,
      interval: dto.interval ?? BillingInterval.MONTHLY,
      currency: dto.currency,
      amountMinor: dto.amountMinor,
      stripePriceId: dto.stripePriceId,
      isActive: dto.isActive,
    });
  }

  // ---- Templates (egg editor) -------------------------------------------

  @Get("templates")
  @RequirePerm("catalog.read")
  listTemplates() {
    return this.templates.list();
  }

  @Post("templates")
  @RequirePerm("catalog.manage")
  @Audit({ action: "admin.template.create", targetType: "GameTemplate" })
  createTemplate(@Body() dto: CreateTemplateDto) {
    return this.templates.create(dto);
  }

  @Get("templates/:id")
  @RequirePerm("catalog.read")
  getTemplate(@Param("id") id: string) {
    return this.templates.get(id);
  }

  @Patch("templates/:id")
  @RequirePerm("catalog.manage")
  @Audit({
    action: "admin.template.update",
    targetType: "GameTemplate",
    targetParam: "id",
  })
  updateTemplate(@Param("id") id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(id, dto);
  }

  @Delete("templates/:id")
  @RequirePerm("catalog.manage")
  @HttpCode(204)
  @Audit({
    action: "admin.template.delete",
    targetType: "GameTemplate",
    targetParam: "id",
  })
  deleteTemplate(@Param("id") id: string) {
    return this.templates.delete(id);
  }

  // ---- Servers (admin create-from-egg) -----------------------------------

  @Get("servers")
  @RequirePerm("servers.read")
  listServers(@Query() pagination: PaginationDto) {
    return this.servers.adminList(pagination);
  }

  @Post("servers")
  @RequirePerm("servers.manage")
  @Audit({ action: "admin.server.create", targetType: "Server" })
  createServer(@Body() dto: AdminCreateServerDto) {
    return this.servers.adminCreate(dto);
  }

  @Delete("servers/:id")
  @RequirePerm("servers.manage")
  @HttpCode(204)
  @Audit({
    action: "admin.server.delete",
    targetType: "Server",
    targetParam: "id",
  })
  deleteServer(@Param("id") id: string) {
    return this.servers.delete(id);
  }

  /**
   * Staff resize: change a server's CPU/RAM/swap/disk directly (no invoice) —
   * for comps/support. Validates node capacity, updates the DB, and applies the
   * new limits live on the agent (no reinstall). Customer-facing upgrades still
   * go through the invoice-gated Upgrade flow.
   */
  @Patch("servers/:id/resize")
  @RequirePerm("servers.manage")
  @Audit({
    action: "admin.server.resize",
    targetType: "Server",
    targetParam: "id",
  })
  resizeServer(@Param("id") id: string, @Body() dto: ResizeServerDto) {
    return this.servers.resize(id, dto);
  }

  // ---- Simple Voice Chat (dedicated UDP port, admin-granted) --------------

  @Get("servers/:id/voice-chat")
  @RequirePerm("servers.read")
  voiceChatStatus(@Param("id") id: string) {
    return this.servers.voiceChatStatus(id);
  }

  @Post("servers/:id/voice-chat")
  @RequirePerm("servers.manage")
  @Audit({
    action: "admin.server.voicechat.enable",
    targetType: "Server",
    targetParam: "id",
  })
  enableVoiceChat(@Param("id") id: string) {
    return this.servers.enableVoiceChat(id);
  }

  @Delete("servers/:id/voice-chat")
  @RequirePerm("servers.manage")
  @Audit({
    action: "admin.server.voicechat.disable",
    targetType: "Server",
    targetParam: "id",
  })
  disableVoiceChat(@Param("id") id: string) {
    return this.servers.disableVoiceChat(id);
  }

  /**
   * Transfer a server to another node (Pterodactyl-style). Stops + snapshots on
   * the source, provisions + restores on the destination, then repoints the
   * server — the source copy is removed only once the destination is verified,
   * so the server always survives. Runs in a queue; returns the transfer row.
   */
  @Post("servers/:id/transfer")
  @RequirePerm("servers.manage")
  @Audit({
    action: "admin.server.transfer",
    targetType: "Server",
    targetParam: "id",
  })
  transferServer(@Param("id") id: string, @Body() dto: TransferServerDto) {
    return this.transfers.requestTransfer(id, dto.toNodeId);
  }

  /** Transfer history for a server (latest first) — for status/progress. */
  @Get("servers/:id/transfers")
  @RequirePerm("servers.read")
  serverTransfers(@Param("id") id: string) {
    return this.transfers.listTransfers(id);
  }

  // ---- Alerts ------------------------------------------------------------

  @Get("alerts")
  @RequirePerm("content.read")
  listAlerts() {
    return this.alerts.listAllAlerts();
  }

  @Post("alerts")
  @RequirePerm("content.manage")
  @Audit({ action: "admin.alert.create", targetType: "GlobalAlert" })
  createAlert(@Body() dto: CreateAlertDto) {
    return this.alerts.createAlert(dto);
  }

  @Patch("alerts/:id")
  @RequirePerm("content.manage")
  @Audit({
    action: "admin.alert.update",
    targetType: "GlobalAlert",
    targetParam: "id",
  })
  updateAlert(@Param("id") id: string, @Body() dto: UpdateAlertDto) {
    return this.alerts.updateAlert(id, dto);
  }

  @Delete("alerts/:id")
  @RequirePerm("content.manage")
  @HttpCode(204)
  @Audit({
    action: "admin.alert.delete",
    targetType: "GlobalAlert",
    targetParam: "id",
  })
  deleteAlert(@Param("id") id: string) {
    return this.alerts.deleteAlert(id);
  }

  // ---- Homepage alerts (public storefront notices) -----------------------

  @Get("homepage-alerts")
  @RequirePerm("content.manage")
  listHomepageAlerts() {
    return this.homepageAlerts.listAll();
  }

  @Post("homepage-alerts")
  @RequirePerm("content.manage")
  @Audit({ action: "admin.homepage-alert.create", targetType: "HomepageAlert" })
  createHomepageAlert(@Body() dto: CreateHomepageAlertDto) {
    return this.homepageAlerts.create(dto);
  }

  @Patch("homepage-alerts/:id")
  @RequirePerm("content.manage")
  @Audit({
    action: "admin.homepage-alert.update",
    targetType: "HomepageAlert",
    targetParam: "id",
  })
  updateHomepageAlert(
    @Param("id") id: string,
    @Body() dto: UpdateHomepageAlertDto,
  ) {
    return this.homepageAlerts.update(id, dto);
  }

  @Delete("homepage-alerts/:id")
  @RequirePerm("content.manage")
  @HttpCode(204)
  @Audit({
    action: "admin.homepage-alert.delete",
    targetType: "HomepageAlert",
    targetParam: "id",
  })
  deleteHomepageAlert(@Param("id") id: string) {
    return this.homepageAlerts.delete(id);
  }

  // ---- Status incidents (public /status page) ----------------------------

  @Get("status/incidents")
  @RequirePerm("content.manage")
  listIncidents() {
    return this.incidents.listAll();
  }

  @Post("status/incidents")
  @RequirePerm("content.manage")
  @Audit({ action: "admin.incident.create", targetType: "StatusIncident" })
  createIncident(@Body() dto: CreateIncidentDto) {
    return this.incidents.create(dto);
  }

  @Post("status/incidents/:id/updates")
  @RequirePerm("content.manage")
  @Audit({
    action: "admin.incident.update.add",
    targetType: "StatusIncident",
    targetParam: "id",
  })
  addIncidentUpdate(
    @Param("id") id: string,
    @Body() dto: AddIncidentUpdateDto,
  ) {
    return this.incidents.addUpdate(id, dto);
  }

  @Patch("status/incidents/:id")
  @RequirePerm("content.manage")
  @Audit({
    action: "admin.incident.update",
    targetType: "StatusIncident",
    targetParam: "id",
  })
  updateIncident(@Param("id") id: string, @Body() dto: UpdateIncidentDto) {
    return this.incidents.update(id, dto);
  }

  @Delete("status/incidents/:id")
  @RequirePerm("content.manage")
  @HttpCode(204)
  @Audit({
    action: "admin.incident.delete",
    targetType: "StatusIncident",
    targetParam: "id",
  })
  deleteIncident(@Param("id") id: string) {
    return this.incidents.remove(id);
  }

  // ---- Status webhooks (outbound real-time pushes; e.g. the Helios bot) ----

  @Get("status/webhooks")
  @RequirePerm("content.manage")
  listStatusWebhooks() {
    return this.webhooks.list();
  }

  @Post("status/webhooks")
  @RequirePerm("content.manage")
  @Audit({ action: "admin.status.webhook.create", targetType: "StatusWebhook" })
  createStatusWebhook(
    @Body() dto: CreateStatusWebhookDto,
    @CurrentUser() user: AuthUser,
  ) {
    // Returns the one-time plaintext signing secret — shown once, never stored.
    return this.webhooks.create(dto.url, dto.events, user.id, dto.description);
  }

  @Patch("status/webhooks/:id")
  @RequirePerm("content.manage")
  @Audit({
    action: "admin.status.webhook.update",
    targetType: "StatusWebhook",
    targetParam: "id",
  })
  updateStatusWebhook(
    @Param("id") id: string,
    @Body() dto: UpdateStatusWebhookDto,
  ) {
    return this.webhooks.update(id, dto);
  }

  @Delete("status/webhooks/:id")
  @RequirePerm("content.manage")
  @HttpCode(204)
  @Audit({
    action: "admin.status.webhook.delete",
    targetType: "StatusWebhook",
    targetParam: "id",
  })
  deleteStatusWebhook(@Param("id") id: string) {
    return this.webhooks.remove(id);
  }

  // ---- Staff (public "Meet the team") ------------------------------------

  @Get("staff")
  @RequirePerm("content.manage")
  listStaff() {
    return this.staff.listAll();
  }

  @Post("staff")
  @RequirePerm("content.manage")
  @Audit({ action: "admin.staff.create", targetType: "StaffMember" })
  createStaff(@Body() dto: CreateStaffMemberDto) {
    return this.staff.create(dto);
  }

  @Patch("staff/:id")
  @RequirePerm("content.manage")
  @Audit({
    action: "admin.staff.update",
    targetType: "StaffMember",
    targetParam: "id",
  })
  updateStaff(@Param("id") id: string, @Body() dto: UpdateStaffMemberDto) {
    return this.staff.update(id, dto);
  }

  @Delete("staff/:id")
  @RequirePerm("content.manage")
  @HttpCode(204)
  @Audit({
    action: "admin.staff.delete",
    targetType: "StaffMember",
    targetParam: "id",
  })
  deleteStaff(@Param("id") id: string) {
    return this.staff.delete(id);
  }

  // ---- Audit logs --------------------------------------------------------

  @Get("audit-logs")
  @RequirePerm("audit.read")
  auditLogs(@Query() query: AuditQueryDto) {
    return this.audit.listAuditLogs(query);
  }

  // ---- Metrics summary ---------------------------------------------------

  @Get("metrics")
  @RequirePerm("dashboard.read")
  metrics() {
    return this.admin.adminSummary();
  }
}
