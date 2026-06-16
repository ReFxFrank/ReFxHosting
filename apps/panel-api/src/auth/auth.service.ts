import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { EmailService } from '../email/email.service';
import { uuidv7 } from '../common/util/uuid';
import { AppConfig } from '../config/configuration';
import { LoginDto, RegisterDto, TokenResponseDto } from './dto/auth.dto';

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Claims carried by the short-lived MFA login-challenge JWT. */
interface MfaChallengeClaims {
  sub: string;
  type: 'mfa';
}

const ARGON_OPTS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly crypto: CryptoService,
    private readonly email: EmailService,
  ) {}

  // ---- registration / login ---------------------------------------------

  async register(dto: RegisterDto): Promise<{ id: string; email: string }> {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Only a live account blocks reuse. A soft-deleted account that still
      // holds this address (e.g. deleted before the address was tombstoned) is
      // released here so the address becomes available again.
      if (!existing.deletedAt) {
        throw new ConflictException('Email already registered');
      }
      await this.prisma.user.update({
        where: { id: existing.id },
        data: { email: `deleted:${Date.now()}:${email}` },
      });
    }

    const user = await this.prisma.user.create({
      data: {
        id: uuidv7(),
        email,
        passwordHash: await argon2.hash(dto.password, ARGON_OPTS),
        firstName: dto.firstName,
        lastName: dto.lastName,
        state: 'PENDING_VERIFICATION',
      },
      select: { id: true, email: true, firstName: true },
    });

    // Mint + dispatch the email-verification token. Email delivery never throws.
    await this.issueEmailVerification(user);

    return { id: user.id, email: user.email };
  }

  /**
   * Create a single-use, hashed email-verification token for the user and email
   * the verify link. The plaintext token is never persisted.
   */
  private async issueEmailVerification(
    user: { id: string; email: string; firstName?: string | null },
  ): Promise<void> {
    const token = this.crypto.token(32);
    await this.prisma.emailVerificationToken.create({
      data: {
        id: uuidv7(),
        userId: user.id,
        tokenHash: this.crypto.hash(token),
        expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
      },
    });
    await this.email.sendEmailVerification(
      { email: user.email, firstName: user.firstName ?? null },
      token,
    );
  }

  async login(
    dto: LoginDto,
    ctx: { ip?: string; userAgent?: string },
  ): Promise<TokenResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase(), deletedAt: null },
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    if (user.state === 'BANNED' || user.state === 'SUSPENDED') {
      throw new UnauthorizedException(`Account ${user.state.toLowerCase()}`);
    }

    // MFA challenge
    if (user.totpEnabledAt && user.totpSecretEnc) {
      if (!dto.totp) {
        // Issue a short-lived, signed challenge token bound to this (already
        // password-verified) principal. The raw user id is NEVER returned.
        return {
          accessToken: '',
          refreshToken: '',
          expiresIn: 0,
          mfaRequired: true,
          mfaToken: await this.issueMfaChallenge(user.id),
        };
      }
      const secret = this.crypto.decrypt(user.totpSecretEnc);
      if (!authenticator.check(dto.totp, secret)) {
        throw new UnauthorizedException('Invalid MFA code');
      }
    }

    return this.issueTokens(user, ctx);
  }

  // ---- MFA login challenge token ----------------------------------------

  /**
   * Mint a short-lived signed JWT that proves the bearer cleared the password
   * factor for `userId`. Carries a dedicated `mfa` type claim and is signed with
   * the dedicated MFA secret, so it cannot be confused with access/refresh
   * tokens and cannot be forged by a client.
   */
  async issueMfaChallenge(userId: string): Promise<string> {
    const jwtCfg = this.config.get<AppConfig['jwt']>('jwt')!;
    return this.jwt.signAsync(
      { sub: userId, type: 'mfa' },
      { secret: jwtCfg.mfaSecret, expiresIn: jwtCfg.mfaTtl },
    );
  }

  /**
   * Verify + decode an MFA challenge token, returning the bound userId. Rejects
   * expired, tampered or wrong-type tokens.
   */
  async verifyMfaChallenge(challengeToken: string): Promise<string> {
    const jwtCfg = this.config.get<AppConfig['jwt']>('jwt')!;
    let payload: MfaChallengeClaims;
    try {
      payload = await this.jwt.verifyAsync<MfaChallengeClaims>(challengeToken, {
        secret: jwtCfg.mfaSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA challenge');
    }
    if (payload.type !== 'mfa' || !payload.sub) {
      throw new UnauthorizedException('Invalid MFA challenge');
    }
    return payload.sub;
  }

  // ---- token issuance + refresh rotation --------------------------------

  async issueTokens(
    user: Pick<User, 'id' | 'email' | 'globalRole'>,
    ctx: { ip?: string; userAgent?: string },
  ): Promise<TokenResponseDto> {
    const jwtCfg = this.config.get<AppConfig['jwt']>('jwt')!;

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.globalRole, type: 'access' },
      { secret: jwtCfg.accessSecret, expiresIn: jwtCfg.accessTtl },
    );

    const sessionId = uuidv7();
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, sid: sessionId, type: 'refresh' },
      { secret: jwtCfg.refreshSecret, expiresIn: jwtCfg.refreshTtl },
    );

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshHash: this.crypto.hash(refreshToken),
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        expiresAt: new Date(Date.now() + jwtCfg.refreshTtl * 1000),
      },
    });

    return { accessToken, refreshToken, expiresIn: jwtCfg.accessTtl };
  }

  async refresh(
    refreshToken: string,
    ctx: { ip?: string; userAgent?: string },
  ): Promise<TokenResponseDto> {
    const jwtCfg = this.config.get<AppConfig['jwt']>('jwt')!;
    let payload: { sub: string; sid: string; type: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: jwtCfg.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      session.refreshHash !== this.crypto.hash(refreshToken)
    ) {
      // Reuse detection: a presented-but-invalid refresh token revokes the
      // whole session family for safety.
      if (session) {
        await this.prisma.session.updateMany({
          where: { userId: session.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      throw new UnauthorizedException('Refresh token rejected');
    }

    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: payload.sub, deletedAt: null },
    });

    // Rotate: revoke the old session, issue a fresh one.
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(user, ctx);
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const jwtCfg = this.config.get<AppConfig['jwt']>('jwt')!;
      const payload = await this.jwt.verifyAsync(refreshToken, {
        secret: jwtCfg.refreshSecret,
      });
      await this.prisma.session.updateMany({
        where: { id: payload.sid, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Idempotent: an invalid token is already "logged out".
    }
  }

  // ---- TOTP enrollment ---------------------------------------------------

  async totpEnroll(userId: string): Promise<{ otpauthUrl: string; secret: string }> {
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: userId },
    });
    const secret = authenticator.generateSecret();
    // Stash the pending secret encrypted; only activate on verify.
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecretEnc: this.crypto.encrypt(secret) },
    });
    const otpauthUrl = authenticator.keyuri(
      user.email,
      this.config.get<AppConfig['rpName']>('rpName')!,
      secret,
    );
    return { otpauthUrl, secret };
  }

  async totpVerify(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: userId },
    });
    if (!user.totpSecretEnc) throw new BadRequestException('No TOTP enrollment in progress');
    const secret = this.crypto.decrypt(user.totpSecretEnc);
    if (!authenticator.check(code, secret)) {
      throw new BadRequestException('Invalid TOTP code');
    }

    // Generate one-time recovery codes.
    const plainCodes = Array.from({ length: 10 }, () =>
      this.crypto.token(5).slice(0, 10).toUpperCase(),
    );
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { totpEnabledAt: new Date() },
      }),
      this.prisma.recoveryCode.deleteMany({ where: { userId } }),
      ...plainCodes.map((c) =>
        this.prisma.recoveryCode.create({
          data: { id: uuidv7(), userId, codeHash: this.crypto.hash(c) },
        }),
      ),
    ]);
    return { recoveryCodes: plainCodes };
  }

  async totpDisable(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabledAt: null, totpSecretEnc: null },
    });
    await this.prisma.recoveryCode.deleteMany({ where: { userId } });
  }

  // ---- Unified MFA verify (login challenge) ------------------------------

  /**
   * Verify a TOTP or recovery code for a user who has cleared the password
   * factor and now needs to satisfy the MFA challenge. Returns a fresh token
   * pair on success. WebAuthn assertions are handled by WebAuthnService; this
   * covers the `totp` and `recovery` methods.
   */
  async mfaVerify(
    userId: string,
    code: string,
    method: 'totp' | 'recovery',
    ctx: { ip?: string; userAgent?: string },
  ): Promise<TokenResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (method === 'recovery') {
      const codes = await this.prisma.recoveryCode.findMany({
        where: { userId, usedAt: null },
      });
      const hash = this.crypto.hash(code.toUpperCase());
      const match = codes.find((c) => c.codeHash === hash);
      if (!match) throw new UnauthorizedException('Invalid recovery code');
      await this.prisma.recoveryCode.update({
        where: { id: match.id },
        data: { usedAt: new Date() },
      });
    } else {
      if (!user.totpSecretEnc) {
        throw new UnauthorizedException('MFA is not configured');
      }
      const secret = this.crypto.decrypt(user.totpSecretEnc);
      if (!authenticator.check(code, secret)) {
        throw new UnauthorizedException('Invalid MFA code');
      }
    }

    return this.issueTokens(user, ctx);
  }

  // ---- Password reset / change ------------------------------------------

  /**
   * Begin a password-reset flow. Always resolves (never leaks whether the email
   * exists). When the user exists a single-use token is minted and stored
   * hashed; the email itself is dispatched out of band.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
      select: { id: true, email: true, firstName: true },
    });
    if (!user) return; // do not leak existence

    // Mint a single-use, time-boxed reset token. We never persist the plaintext;
    // only its SHA-256 hash is stored, the raw token travels by email.
    const token = this.crypto.token(32);
    await this.prisma.passwordResetToken.create({
      data: {
        id: uuidv7(),
        userId: user.id,
        tokenHash: this.crypto.hash(token),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });
    await this.email.sendPasswordReset(
      { email: user.email, firstName: user.firstName },
      token,
    );
  }

  /**
   * Complete a password reset: validate the (hashed) token, set a new argon2id
   * hash, mark the token used and revoke every existing session for the user.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = this.crypto.hash(token);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await argon2.hash(newPassword, ARGON_OPTS) },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Invalidate every active session — a reset implies the account may have
      // been compromised.
      this.prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  // ---- Email verification ------------------------------------------------

  /**
   * Consume an email-verification token: mark the address verified and move the
   * user to ACTIVE. Idempotent-safe rejection on invalid/expired/used tokens.
   */
  async verifyEmail(token: string): Promise<void> {
    const tokenHash = this.crypto.hash(token);
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date(), state: 'ACTIVE' },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
  }

  /**
   * Re-issue an email-verification token. Always resolves (no enumeration): only
   * does work when the user exists and is still pending verification.
   */
  async resendVerification(email: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
      select: { id: true, email: true, firstName: true, emailVerifiedAt: true },
    });
    if (!user || user.emailVerifiedAt) return; // nothing to do / no leak
    await this.issueEmailVerification(user);
  }

  /**
   * Change the caller's password: verify the current password, re-hash the new
   * one and revoke every *other* active session (keeping the current device).
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    keepSessionId?: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await argon2.verify(user.passwordHash, currentPassword);
    if (!ok) throw new BadRequestException('Current password is incorrect');

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(newPassword, ARGON_OPTS) },
    });

    // Revoke all other sessions for safety; keep the current one if known.
    await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(keepSessionId ? { id: { not: keepSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }

  // ---- Session management -----------------------------------------------

  /** List the caller's active (non-revoked, non-expired) sessions. */
  async listSessions(userId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
      },
    });
    return sessions;
  }

  /** Revoke a single session owned by the caller. Idempotent. */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) throw new NotFoundException('Session not found');
    await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
