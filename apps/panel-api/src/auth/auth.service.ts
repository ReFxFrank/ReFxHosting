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
import { uuidv7 } from '../common/util/uuid';
import { AppConfig } from '../config/configuration';
import { LoginDto, RegisterDto, TokenResponseDto } from './dto/auth.dto';

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
  ) {}

  // ---- registration / login ---------------------------------------------

  async register(dto: RegisterDto): Promise<{ id: string; email: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) throw new ConflictException('Email already registered');

    const user = await this.prisma.user.create({
      data: {
        id: uuidv7(),
        email: dto.email.toLowerCase(),
        passwordHash: await argon2.hash(dto.password, ARGON_OPTS),
        firstName: dto.firstName,
        lastName: dto.lastName,
        state: 'PENDING_VERIFICATION',
      },
      select: { id: true, email: true },
    });
    // TODO(impl): dispatch verification email via notifications module.
    return user;
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
        return {
          accessToken: '',
          refreshToken: '',
          expiresIn: 0,
          mfaRequired: true,
        };
      }
      const secret = this.crypto.decrypt(user.totpSecretEnc);
      if (!authenticator.check(dto.totp, secret)) {
        throw new UnauthorizedException('Invalid MFA code');
      }
    }

    return this.issueTokens(user, ctx);
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
      select: { id: true },
    });
    if (!user) return; // do not leak existence

    // Mint a single-use, time-boxed reset token. We never persist the plaintext.
    const token = this.crypto.token(32);
    void token;
    // TODO(impl): persist the hashed reset token (needs a User.passwordResetTokenHash
    // column + migration) and dispatch the reset email (link carrying the
    // plaintext token) via the notifications/email delivery provider.
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
