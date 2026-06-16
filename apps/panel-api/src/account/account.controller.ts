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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateApiKeyDto, TotpVerifyDto } from '../auth/dto/auth.dto';
import { UpdateProfileDto } from '../users/dto/update-profile.dto';
import { ChangePasswordDto, TotpEnableDto } from './dto/account.dto';

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
    );
    return {
      id: record.id,
      name: record.name,
      prefix: record.prefix,
      scopes: record.scopes,
      key: plaintext,
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

  @Post('notifications/:id/read')
  @HttpCode(200)
  markNotificationRead(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.notifications.markRead(userId, id);
  }
}
