import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import {
  createGuardrails,
  generateSecret,
  generateURI,
  verifySync,
} from 'otplib';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { EmailService } from '../email/email.service';
import { uuidv7 } from '../common/util/uuid';
import { AppConfig } from '../config/configuration';
import { LoginDto, RegisterDto, TokenResponseDto } from './dto/auth.dto';

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
// Total distinct passwords blocked from reuse (current + recent history). Small
// and fixed so storage AND the per-change argon2-verify loop stay bounded.
const PASSWORD_HISTORY_DEPTH = 5;
// Grace window in which a just-rotated refresh token may be presented again
// (e.g. a second browser tab refreshing concurrently) without tripping
// reuse-detection. Long enough for slow tabs/networks, short enough to bound a
// genuine replay.
const REFRESH_ROTATION_GRACE_MS = 60 * 1000; // 60s

// "Trust this device": refresh-token lifetime for a remembered device. Sliding
// (re-extended on every refresh), so an active device effectively never has to
// log in again; an idle one stays valid this long. Normal sessions use the
// configured jwt.refreshTtl (default 30d).
const TRUSTED_REFRESH_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

// otplib 13 enforces a 16-byte (128-bit) minimum secret, but accounts enrolled
// under otplib 12 have 10-byte (80-bit) base32 secrets — without relaxing the
// floor, verifying their codes THROWS (a 500) instead of returning a result.
// New enrollments use otplib's 160-bit default, so this only affects legacy
// secrets. 8 bytes (64 bits) is a safe lower bound for any pre-existing secret.
const TOTP_GUARDRAILS = createGuardrails({ MIN_SECRET_BYTES: 8 });

/** Claims carried by the short-lived MFA login-challenge JWT. */
interface MfaChallengeClaims {
  sub: string;
  type: 'mfa';
  /** "Remember this device" choice, carried through the MFA step. */
  rmb?: boolean;
}

const ARGON_OPTS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

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

    let user: { id: string; email: string; firstName: string | null };
    try {
      user = await this.prisma.user.create({
        data: {
          id: uuidv7(),
          email,
          passwordHash: await argon2.hash(dto.password, ARGON_OPTS),
          firstName: dto.firstName,
          lastName: dto.lastName,
          addressLine1: dto.addressLine1,
          addressLine2: dto.addressLine2,
          city: dto.city,
          region: dto.region,
          postalCode: dto.postalCode,
          country: dto.country.toUpperCase(),
          state: 'PENDING_VERIFICATION',
        },
        select: { id: true, email: true, firstName: true },
      });
    } catch (e) {
      // Two concurrent registrations for the same new address both pass the
      // pre-check, then one loses the unique-email constraint — return a clean
      // 409 instead of a raw 500.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Email already registered');
      }
      throw e;
    }

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
    // Always run a verify (against a dummy hash of the same cost when the
    // user/credential is missing) so response time doesn't reveal whether an
    // email is registered.
    const ok = await argon2
      .verify(user?.passwordHash ?? (await this.dummyPasswordHash()), dto.password)
      .catch(() => false);
    if (!user || !user.passwordHash || !ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.state === 'BANNED' || user.state === 'SUSPENDED') {
      throw new UnauthorizedException(`Account ${user.state.toLowerCase()}`);
    }

    // MFA challenge — required when the user has TOTP enabled OR any passkey.
    const totpOn = !!(user.totpEnabledAt && user.totpSecretEnc);
    const passkeyCount = await this.prisma.webAuthnCredential.count({
      where: { userId: user.id },
    });
    if (totpOn || passkeyCount > 0) {
      // Fast path: a valid TOTP code supplied inline clears the challenge.
      if (totpOn && dto.totp) {
        const secret = this.crypto.decrypt(user.totpSecretEnc!);
        if (!verifySync({ token: dto.totp, secret, guardrails: TOTP_GUARDRAILS }).valid) {
          throw new UnauthorizedException('Invalid MFA code');
        }
        return this.issueTokens(user, ctx, { trusted: !!dto.rememberMe });
      }
      // Otherwise hand back a short-lived, signed challenge token bound to this
      // (already password-verified) principal. The raw user id is NEVER returned.
      const methods: ('totp' | 'recovery' | 'webauthn')[] = [
        ...(totpOn ? (['totp', 'recovery'] as const) : []),
        ...(passkeyCount > 0 ? (['webauthn'] as const) : []),
      ];
      return {
        accessToken: '',
        refreshToken: '',
        expiresIn: 0,
        mfaRequired: true,
        mfaToken: await this.issueMfaChallenge(user.id, !!dto.rememberMe),
        methods,
      };
    }

    return this.issueTokens(user, ctx, { trusted: !!dto.rememberMe });
  }

  /**
   * Issue a session for a user who has already cleared every factor through a
   * separate ceremony (e.g. a passkey assertion verified against the login MFA
   * challenge). Used by the WebAuthn login path in the controller.
   */
  async issueSessionForUser(
    userId: string,
    ctx: { ip?: string; userAgent?: string },
    trusted = false,
  ): Promise<TokenResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    return this.issueTokens(user, ctx, { trusted });
  }

  // ---- MFA login challenge token ----------------------------------------

  /**
   * Mint a short-lived signed JWT that proves the bearer cleared the password
   * factor for `userId`. Carries a dedicated `mfa` type claim and is signed with
   * the dedicated MFA secret, so it cannot be confused with access/refresh
   * tokens and cannot be forged by a client.
   */
  async issueMfaChallenge(userId: string, trusted = false): Promise<string> {
    const jwtCfg = this.config.get<AppConfig['jwt']>('jwt')!;
    return this.jwt.signAsync(
      { sub: userId, type: 'mfa', rmb: trusted },
      { secret: jwtCfg.mfaSecret, expiresIn: jwtCfg.mfaTtl },
    );
  }

  /**
   * Verify + decode an MFA challenge token, returning the bound userId and the
   * carried "remember this device" choice. Rejects expired/tampered/wrong-type.
   */
  async verifyMfaChallenge(
    challengeToken: string,
  ): Promise<{ userId: string; trusted: boolean }> {
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
    return { userId: payload.sub, trusted: !!payload.rmb };
  }

  // ---- token issuance + refresh rotation --------------------------------

  async issueTokens(
    user: Pick<User, 'id' | 'email' | 'globalRole'>,
    ctx: { ip?: string; userAgent?: string },
    opts?: { trusted?: boolean },
  ): Promise<TokenResponseDto> {
    const jwtCfg = this.config.get<AppConfig['jwt']>('jwt')!;
    const trusted = !!opts?.trusted;
    // Trusted ("remember this device") sessions live longer; the flag rides in
    // the refresh token so it survives rotation without a schema change.
    const refreshTtl = trusted ? TRUSTED_REFRESH_TTL_SECONDS : jwtCfg.refreshTtl;

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.globalRole, type: 'access' },
      { secret: jwtCfg.accessSecret, expiresIn: jwtCfg.accessTtl },
    );

    const sessionId = uuidv7();
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, sid: sessionId, type: 'refresh', trusted },
      { secret: jwtCfg.refreshSecret, expiresIn: refreshTtl },
    );

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshHash: this.crypto.hash(refreshToken),
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    return { accessToken, refreshToken, expiresIn: jwtCfg.accessTtl };
  }

  async refresh(
    refreshToken: string,
    ctx: { ip?: string; userAgent?: string },
  ): Promise<TokenResponseDto> {
    const jwtCfg = this.config.get<AppConfig['jwt']>('jwt')!;
    let payload: { sub: string; sid: string; type: string; trusted?: boolean };
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

    const now = new Date();
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
    });
    const hashOk =
      !!session && session.refreshHash === this.crypto.hash(refreshToken);

    // Unknown sid, expired, or a token whose hash doesn't match the session →
    // genuinely bad. If it matched a real session we still treat a hash/expiry
    // failure as possible reuse and revoke the family for safety.
    if (!session || !hashOk || session.expiresAt < now) {
      if (session && hashOk) {
        await this.revokeFamily(session.userId);
      }
      throw new UnauthorizedException('Refresh token rejected');
    }

    // The presented token is genuine (hash matches an unexpired session).
    if (session.revokedAt) {
      // Tolerate a BENIGN concurrent refresh: if this session was revoked by a
      // ROTATION moments ago (another tab/request already rotated this exact
      // token), issue a fresh session instead of nuking the family. Outside the
      // grace window — or if it was revoked by logout/reset (no rotatedAt) — this
      // is real reuse, so revoke the family.
      const rotatedRecently =
        session.rotatedAt &&
        now.getTime() - session.rotatedAt.getTime() <= REFRESH_ROTATION_GRACE_MS;
      if (!rotatedRecently) {
        await this.revokeFamily(session.userId);
        throw new UnauthorizedException('Refresh token rejected');
      }
      const user = await this.prisma.user.findFirstOrThrow({
        where: { id: payload.sub, deletedAt: null },
      });
      return this.issueTokens(user, ctx, { trusted: !!payload.trusted });
    }

    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: payload.sub, deletedAt: null },
    });

    // Rotate: revoke the old session (marking it rotated), issue a fresh one.
    // Guard the update on revokedAt:null so two concurrent rotations can't both
    // "win" — the loser falls into the grace path above on its retry.
    await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: now, rotatedAt: now },
    });
    return this.issueTokens(user, ctx, { trusted: !!payload.trusted });
  }

  /** Cached argon2id hash (same cost as real passwords) for login timing parity. */
  private dummyHashCache?: string;
  private async dummyPasswordHash(): Promise<string> {
    if (!this.dummyHashCache) {
      this.dummyHashCache = await argon2.hash(
        'refx-login-timing-equalizer',
        ARGON_OPTS,
      );
    }
    return this.dummyHashCache;
  }

  /** Revoke every active session for a user (reuse-detection / security events). */
  private async revokeFamily(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
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
    const secret = generateSecret();
    // Stash the pending secret encrypted; only activate on verify.
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecretEnc: this.crypto.encrypt(secret) },
    });
    const otpauthUrl = generateURI({
      label: user.email,
      issuer: this.config.get<AppConfig['rpName']>('rpName')!,
      secret,
    });
    return { otpauthUrl, secret };
  }

  async totpVerify(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: userId },
    });
    if (!user.totpSecretEnc) throw new BadRequestException('No TOTP enrollment in progress');
    const secret = this.crypto.decrypt(user.totpSecretEnc);
    if (!verifySync({ token: code, secret, guardrails: TOTP_GUARDRAILS }).valid) {
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
    trusted = false,
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
      if (!verifySync({ token: code, secret, guardrails: TOTP_GUARDRAILS }).valid) {
        throw new UnauthorizedException('Invalid MFA code');
      }
    }

    return this.issueTokens(user, ctx, { trusted });
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

    // Don't allow reusing the current or a recent past password.
    const current = await this.prisma.user.findUnique({
      where: { id: record.userId },
      select: { passwordHash: true },
    });
    await this.assertPasswordNotReused(
      record.userId,
      current?.passwordHash,
      newPassword,
    );

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

    // Remember the just-replaced password so it can't be reused later.
    await this.recordPasswordHistory(record.userId, current?.passwordHash);
  }

  /**
   * Reject a new password that matches the current one OR any of the recent
   * history entries (up to PASSWORD_HISTORY_DEPTH total). Only argon2 hashes are
   * compared — never plaintext — and the candidate set is capped, so the verify
   * loop is bounded (no DoS). A malformed history row can never break the flow.
   */
  private async assertPasswordNotReused(
    userId: string,
    currentHash: string | null | undefined,
    newPassword: string,
  ): Promise<void> {
    const history = await this.prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: PASSWORD_HISTORY_DEPTH - 1,
      select: { passwordHash: true },
    });
    const hashes = [currentHash, ...history.map((h) => h.passwordHash)].filter(
      (h): h is string => Boolean(h),
    );
    for (const hash of hashes) {
      try {
        if (await argon2.verify(hash, newPassword)) {
          throw new BadRequestException(
            "Please choose a password you haven't used before.",
          );
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        // A non-verify error (e.g. a malformed stored hash) must not block the
        // user from setting a password — skip that entry.
      }
    }
  }

  /**
   * Append a now-replaced password hash to the user's history and prune to the
   * newest PASSWORD_HISTORY_DEPTH - 1 entries (the current password lives on the
   * User row and counts as the most recent). Best-effort: a failure here never
   * fails the password change itself.
   */
  private async recordPasswordHistory(
    userId: string,
    oldHash: string | null | undefined,
  ): Promise<void> {
    if (!oldHash) return;
    try {
      await this.prisma.passwordHistory.create({
        data: { id: uuidv7(), userId, passwordHash: oldHash },
      });
      const keep = await this.prisma.passwordHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: PASSWORD_HISTORY_DEPTH - 1,
        select: { id: true },
      });
      await this.prisma.passwordHistory.deleteMany({
        where: { userId, id: { notIn: keep.map((k) => k.id) } },
      });
    } catch (err) {
      this.logger.warn(
        `password history record failed for ${userId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Whether a password-reset token is still usable, WITHOUT consuming it. Lets
   * the reset page show an "expired link" state on open instead of only after
   * the user fills in a new password. Reveals nothing but validity (the token is
   * high-entropy and unguessable), so there's no enumeration risk.
   */
  async resetTokenValid(token: string): Promise<boolean> {
    if (!token) return false;
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.crypto.hash(token) },
    });
    return Boolean(record && !record.usedAt && record.expiresAt >= new Date());
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

    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date(), state: 'ACTIVE' },
        select: { email: true, firstName: true },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Welcome the freshly-verified customer (best-effort).
    await this.email.sendWelcome({ email: user.email, firstName: user.firstName });
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

    // New password must differ from the current one AND recent past ones.
    await this.assertPasswordNotReused(userId, user.passwordHash, newPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(newPassword, ARGON_OPTS) },
    });
    // Remember the just-replaced password so it can't be reused later.
    await this.recordPasswordHistory(userId, user.passwordHash);

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
