import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { WebAuthnService } from './webauthn.service';
import { ApiKeyService } from './api-key.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { AllowWhenPasswordExpired } from '../common/decorators/allow-when-password-expired.decorator';
import {
  CreateApiKeyDto,
  ForgotPasswordDto,
  LoginDto,
  MfaVerifyDto,
  RefreshDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
  TotpVerifyDto,
  VerifyEmailDto,
  WebAuthnVerifyDto,
  WebAuthnLoginOptionsDto,
  WebAuthnLoginVerifyDto,
} from './dto/auth.dto';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';

@ApiTags('auth')
@Controller('auth')
// Protect the controller by default; @Public() opts the login/register/refresh/
// password-reset/email-verify/mfa-challenge routes back out. Without this guard
// the authenticated routes (me, totp, webauthn, api-keys) would run with no
// principal attached and dereferencing @CurrentUser() 500s.
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly webauthn: WebAuthnService,
    private readonly apiKeys: ApiKeyService,
    private readonly users: UsersService,
  ) {}

  // ---- Current user / password reset / MFA verify -----------------------

  @ApiBearerAuth()
  @Get('me')
  // Allowed while a password change is pending so the web can bootstrap the
  // session (and render the forced-change modal) instead of erroring.
  @AllowWhenPasswordExpired()
  async me(@CurrentUser() user: AuthUser) {
    const profile = await this.users.getProfile(user.id);
    // Expose the caller's effective admin permissions so the web can gate the
    // admin UI (the server still enforces them on every request).
    return { ...profile, permissions: user.permissions };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email);
    // Always succeed regardless of whether the email exists.
    return { ok: true };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  @Audit({ action: 'auth.password.reset', targetType: 'User' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.newPassword);
    return { ok: true };
  }

  /**
   * Check (without consuming) whether a reset link is still valid, so the reset
   * page can show an "expired/used link" state on open. Returns only validity.
   */
  @Public()
  @Get('reset-password/valid')
  async resetPasswordValid(@Query('token') token = '') {
    return { valid: await this.auth.resetTokenValid(token) };
  }

  @Public()
  @Post('verify-email')
  @HttpCode(200)
  @Audit({ action: 'auth.email.verify', targetType: 'User' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.auth.verifyEmail(dto.token);
    return { ok: true };
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(200)
  // Tighter than the global limit: this sends an email, so cap re-requests.
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    await this.auth.resendVerification(dto.email);
    // Always succeed regardless of whether the email exists / is pending.
    return { ok: true };
  }

  @Public()
  @Post('mfa/verify')
  @HttpCode(200)
  async mfaVerify(@Body() dto: MfaVerifyDto, @Req() req: any) {
    // Verify + decode the signed, short-lived MFA challenge token issued at
    // login. This rejects expired / tampered / wrong-type tokens; the raw user
    // id is never accepted as a challenge token.
    const { userId, trusted } = await this.auth.verifyMfaChallenge(dto.mfaToken);
    return this.auth.mfaVerify(
      userId,
      dto.code,
      dto.method === 'recovery' ? 'recovery' : 'totp',
      { ip: req.ip, userAgent: req.headers['user-agent'] },
      trusted,
    );
  }

  @Public()
  @Post('register')
  @Audit({ action: 'auth.register', targetType: 'User' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  // Tighter than the global per-IP limit: blunts password brute-forcing while
  // still allowing a legitimate user a few retries.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: any) {
    return this.auth.login(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @AllowWhenPasswordExpired()
  refresh(@Body() dto: RefreshDto, @Req() req: any) {
    return this.auth.refresh(dto.refreshToken, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @AllowWhenPasswordExpired()
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
  }

  // ---- TOTP --------------------------------------------------------------

  @ApiBearerAuth()
  @Post('mfa/totp/enroll')
  totpEnroll(@CurrentUser('id') userId: string) {
    return this.auth.totpEnroll(userId);
  }

  @ApiBearerAuth()
  @Post('mfa/totp/verify')
  @Audit({ action: 'auth.mfa.totp.enable', targetType: 'User' })
  totpVerify(@CurrentUser('id') userId: string, @Body() dto: TotpVerifyDto) {
    return this.auth.totpVerify(userId, dto.code);
  }

  @ApiBearerAuth()
  @Delete('mfa/totp')
  @HttpCode(204)
  @Audit({ action: 'auth.mfa.totp.disable', targetType: 'User' })
  totpDisable(@CurrentUser('id') userId: string) {
    return this.auth.totpDisable(userId);
  }

  // ---- WebAuthn ----------------------------------------------------------

  @ApiBearerAuth()
  @Post('mfa/webauthn/register/options')
  webauthnRegOptions(
    @CurrentUser('id') userId: string,
    @CurrentUser('email') email: string,
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    return this.webauthn.registrationOptions(userId, email);
  }

  @ApiBearerAuth()
  @Post('mfa/webauthn/register/verify')
  webauthnRegVerify(
    @CurrentUser('id') userId: string,
    @Body() dto: WebAuthnVerifyDto,
  ) {
    return this.webauthn.verifyRegistration(userId, dto.response as any, dto.label);
  }

  @ApiBearerAuth()
  @Get('mfa/webauthn/credentials')
  webauthnList(@CurrentUser('id') userId: string) {
    return this.webauthn.listCredentials(userId);
  }

  @ApiBearerAuth()
  @Delete('mfa/webauthn/credentials/:id')
  @HttpCode(204)
  @Audit({ action: 'auth.mfa.webauthn.remove', targetType: 'WebAuthnCredential', targetParam: 'id' })
  async webauthnRemove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    await this.webauthn.removeCredential(userId, id);
  }

  @ApiBearerAuth()
  @Post('mfa/webauthn/auth/options')
  webauthnAuthOptions(
    @CurrentUser('id') userId: string,
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    return this.webauthn.authenticationOptions(userId);
  }

  @ApiBearerAuth()
  @Post('mfa/webauthn/auth/verify')
  webauthnAuthVerify(
    @CurrentUser('id') userId: string,
    @Body() dto: WebAuthnVerifyDto,
  ) {
    return this.webauthn.verifyAuthentication(userId, dto.response as any);
  }

  // ---- WebAuthn login (passkey as a second factor at sign-in) ------------

  @Public()
  @Post('mfa/webauthn/login/options')
  @HttpCode(200)
  async webauthnLoginOptions(
    @Body() dto: WebAuthnLoginOptionsDto,
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const { userId } = await this.auth.verifyMfaChallenge(dto.mfaToken);
    return this.webauthn.authenticationOptions(userId);
  }

  @Public()
  @Post('mfa/webauthn/login/verify')
  @HttpCode(200)
  @Audit({ action: 'auth.mfa.webauthn.login', targetType: 'User' })
  async webauthnLoginVerify(@Body() dto: WebAuthnLoginVerifyDto, @Req() req: any) {
    const { userId, trusted } = await this.auth.verifyMfaChallenge(dto.mfaToken);
    await this.webauthn.verifyAuthentication(userId, dto.response as any);
    return this.auth.issueSessionForUser(
      userId,
      { ip: req.ip, userAgent: req.headers['user-agent'] },
      trusted,
    );
  }

  // ---- API keys ----------------------------------------------------------

  @ApiBearerAuth()
  @Post('api-keys')
  @Audit({ action: 'auth.apikey.create', targetType: 'ApiKey' })
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
      key: plaintext,
      prefix: record.prefix,
      id: record.id,
      expiresAt: record.expiresAt,
    };
  }
}
