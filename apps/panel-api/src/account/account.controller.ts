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
import { AuthService } from '../auth/auth.service';
import { ApiKeyService } from '../auth/api-key.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../platform/notifications.service';
import { PushService } from '../push/push.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { AllowWhenPasswordExpired } from '../common/decorators/allow-when-password-expired.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateApiKeyDto, TotpVerifyDto } from '../auth/dto/auth.dto';
import { UpdateProfileDto } from '../users/dto/update-profile.dto';
import { ChangePasswordDto, SetAvatarDto, TotpEnableDto } from './dto/account.dto';
import { RegisterPushTokenDto } from './dto/push-token.dto';

/**
 * Account self-service surface the web calls under `/account/*`. Thin aliases
 * over AuthService / ApiKeyService / NotificationsService — everything is scoped
 * to the authenticated caller.
 */
@ApiTags('account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('account')
export class AccountController {
  constructor(
    private readonly auth: AuthService,
    private readonly apiKeys: ApiKeyService,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
  ) {}

  // ---- Profile -----------------------------------------------------------

  @Get()
  getProfile(@CurrentUser('id') userId: string) {
    return this.users.getProfile(userId);
  }

  @Patch()
  @Audit({ action: 'account.profile.update', targetType: 'User' })
  updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.users.updateProfile(userId, dto);
  }

  /** Upload an avatar (downscaled data URL from the browser). */
  @Post('avatar')
  @Audit({ action: 'account.avatar.update', targetType: 'User' })
  setAvatar(@CurrentUser('id') userId: string, @Body() dto: SetAvatarDto) {
    return this.users.setAvatar(userId, dto.dataUrl);
  }

  /** GDPR data export: everything we hold for the caller, as JSON. */
  @Get('export')
  @Audit({ action: 'account.export', targetType: 'User' })
  exportData(@CurrentUser('id') userId: string) {
    return this.users.exportData(userId);
  }

  /** Self-service account deletion (soft-delete + tombstone + revoke sessions). */
  @Delete()
  @HttpCode(204)
  @Audit({ action: 'account.delete', targetType: 'User' })
  deleteAccount(@CurrentUser('id') userId: string) {
    return this.users.deleteOwnAccount(userId);
  }

  // ---- API keys ----------------------------------------------------------

  @Get('api-keys')
  listApiKeys(@CurrentUser('id') userId: string) {
    return this.apiKeys.list(userId);
  }

  @Post('api-keys')
  @Audit({ action: 'account.apikey.create', targetType: 'ApiKey' })
  async createApiKey(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateApiKeyDto,
  ) {
    const { plaintext, record } = await this.apiKeys.issue(
      userId,
      dto.name,
      dto.scopes,
      dto.allowedIps,
      dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    );
    return {
      id: record.id,
      name: record.name,
      prefix: record.prefix,
      scopes: record.scopes,
      expiresAt: record.expiresAt,
      // Plaintext is shown ONCE here; it is never stored or retrievable again.
      // Field name MUST match the web client's ApiKey.token (the copy-once UI).
      token: plaintext,
    };
  }

  @Delete('api-keys/:id')
  @HttpCode(204)
  @Audit({ action: 'account.apikey.revoke', targetType: 'ApiKey', targetParam: 'id' })
  revokeApiKey(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.apiKeys.revoke(userId, id);
  }

  // ---- MFA (TOTP) --------------------------------------------------------

  @Post('mfa/totp/setup')
  totpSetup(@CurrentUser('id') userId: string) {
    return this.auth.totpEnroll(userId);
  }

  @Post('mfa/totp/enable')
  @Audit({ action: 'account.mfa.totp.enable', targetType: 'User' })
  totpEnable(@CurrentUser('id') userId: string, @Body() dto: TotpVerifyDto) {
    return this.auth.totpVerify(userId, dto.code);
  }

  // Web posts here with the current code; we also accept DELETE per the spec.
  @Post('mfa/totp/disable')
  @HttpCode(204)
  @Audit({ action: 'account.mfa.totp.disable', targetType: 'User' })
  totpDisablePost(@CurrentUser('id') userId: string, @Body() _dto: TotpEnableDto) {
    return this.auth.totpDisable(userId);
  }

  @Delete('mfa/totp/disable')
  @HttpCode(204)
  @Audit({ action: 'account.mfa.totp.disable', targetType: 'User' })
  totpDisable(@CurrentUser('id') userId: string) {
    return this.auth.totpDisable(userId);
  }

  // ---- Password ----------------------------------------------------------

  @Post('password')
  @HttpCode(204)
  // The user MUST be able to reach this even with mustChangePassword set —
  // it is how they clear the flag.
  @AllowWhenPasswordExpired()
  @Audit({ action: 'account.password.change', targetType: 'User' })
  changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(userId, dto.currentPassword, dto.newPassword);
  }

  // ---- Sessions ----------------------------------------------------------

  @Get('sessions')
  sessions(@CurrentUser('id') userId: string) {
    return this.auth.listSessions(userId);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  @Audit({ action: 'account.session.revoke', targetType: 'Session', targetParam: 'id' })
  revokeSession(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.auth.revokeSession(userId, id);
  }

  // ---- Notifications -----------------------------------------------------

  @Get('notifications')
  async notificationsList(
    @CurrentUser('id') userId: string,
    @Query() pagination: PaginationDto,
  ) {
    const result = await this.notifications.listNotifications(userId, pagination);
    // The web expects a plain array of notifications here.
    return result.data;
  }

  @Get('notifications/unread-count')
  notificationsUnread(@CurrentUser('id') userId: string) {
    return this.notifications.unreadCount(userId);
  }

  @Post('notifications/:id/read')
  @HttpCode(200)
  markNotificationRead(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.notifications.markRead(userId, id);
  }

  @Post('notifications/read-all')
  @HttpCode(200)
  markAllNotificationsRead(@CurrentUser('id') userId: string) {
    return this.notifications.markAllRead(userId);
  }

  @Delete('notifications/:id')
  @HttpCode(200)
  clearNotification(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.notifications.deleteNotification(userId, id);
  }

  @Delete('notifications')
  @HttpCode(200)
  clearAllNotifications(@CurrentUser('id') userId: string) {
    return this.notifications.clearAll(userId);
  }

  // ---- Push tokens (mobile) ----------------------------------------------

  /** Register/refresh this device's push token for the caller (idempotent). */
  @Post('push-tokens')
  @HttpCode(204)
  @Audit({ action: 'account.push-token.register', targetType: 'User' })
  async registerPushToken(
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterPushTokenDto,
  ): Promise<void> {
    await this.push.registerToken(userId, dto.token, dto.platform);
  }

  /** Remove this device's push token (e.g. on sign-out). Idempotent. */
  @Delete('push-tokens/:token')
  @HttpCode(204)
  @Audit({ action: 'account.push-token.remove', targetType: 'User' })
  async removePushToken(
    @CurrentUser('id') userId: string,
    @Param('token') token: string,
  ): Promise<void> {
    await this.push.removeToken(userId, token);
  }
}
