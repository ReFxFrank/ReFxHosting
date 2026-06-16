import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';

/**
 * Auth hardening: password reset, email verification and the signed MFA login
 * challenge token. Prisma, ConfigService and EmailService are mocked. A real
 * JwtService is used so the MFA challenge is signed/verified for real.
 */
describe('AuthService hardening', () => {
  let prisma: any;
  let jwt: JwtService;
  let config: any;
  let crypto: any;
  let email: any;
  let service: AuthService;

  const MFA_SECRET = 'mfa-secret-for-tests';
  const USER_ID = 'user-1';

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      session: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
      },
      passwordResetToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      emailVerificationToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(async (arr: Promise<unknown>[]) => Promise.all(arr)),
    };

    jwt = new JwtService({});
    config = {
      get: jest.fn((key: string) => {
        if (key === 'jwt') {
          return {
            accessSecret: 'a',
            refreshSecret: 'r',
            accessTtl: 900,
            refreshTtl: 86400,
            mfaSecret: MFA_SECRET,
            mfaTtl: 300,
          };
        }
        return undefined;
      }),
    };
    // Deterministic, transparent crypto stub.
    crypto = {
      encrypt: jest.fn((s: string) => `enc(${s})`),
      decrypt: jest.fn((s: string) => s.replace(/^enc\(|\)$/g, '')),
      hash: jest.fn((s: string) => `hash(${s})`),
      token: jest.fn(() => 'RAW-RANDOM-TOKEN'),
    };
    email = {
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
      sendEmailVerification: jest.fn().mockResolvedValue(undefined),
      sendWelcome: jest.fn().mockResolvedValue(undefined),
      sendGeneric: jest.fn().mockResolvedValue(undefined),
    };

    service = new AuthService(prisma, jwt, config, crypto, email);
  });

  // ---- password reset ------------------------------------------------------

  describe('forgotPassword', () => {
    it('persists a hashed token and emails a reset link when the user exists', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: USER_ID,
        email: 'u@example.com',
        firstName: 'Sam',
      });

      await service.forgotPassword('U@Example.com');

      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      const data = prisma.passwordResetToken.create.mock.calls[0][0].data;
      // Stored value is crypto.hash(rawToken) — the hash is persisted, the raw
      // token is only emailed (asserted below). (The test stub formats the hash
      // as `hash(<input>)`, so we assert it routed through crypto.hash.)
      expect(crypto.hash).toHaveBeenCalledWith('RAW-RANDOM-TOKEN');
      expect(data.tokenHash).toBe('hash(RAW-RANDOM-TOKEN)');
      expect(data.userId).toBe(USER_ID);
      expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
      // Raw token is emailed.
      expect(email.sendPasswordReset).toHaveBeenCalledWith(
        { email: 'u@example.com', firstName: 'Sam' },
        'RAW-RANDOM-TOKEN',
      );
    });

    it('does nothing and does not leak existence for an unknown email', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.forgotPassword('ghost@example.com')).resolves.toBeUndefined();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(email.sendPasswordReset).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('sets a new hash, marks the token used and revokes sessions (happy path)', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'tok-1',
        userId: USER_ID,
        tokenHash: 'hash(RAW-RANDOM-TOKEN)',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await service.resetPassword('RAW-RANDOM-TOKEN', 'a-brand-new-password');

      expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: 'hash(RAW-RANDOM-TOKEN)' },
      });
      // The new password is hashed with argon2id (PHC string), not stored raw.
      const userUpdate = prisma.user.update.mock.calls[0][0];
      expect(userUpdate.where).toEqual({ id: USER_ID });
      expect(userUpdate.data.passwordHash).toMatch(/^\$argon2id\$/);
      // Token consumed + all sessions revoked.
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'tok-1' },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('rejects an expired token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'tok-1',
        userId: USER_ID,
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(
        service.resetPassword('RAW-RANDOM-TOKEN', 'a-brand-new-password'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects an already-used token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'tok-1',
        userId: USER_ID,
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });
      await expect(
        service.resetPassword('RAW-RANDOM-TOKEN', 'a-brand-new-password'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unknown token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(
        service.resetPassword('nope', 'a-brand-new-password'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ---- email verification --------------------------------------------------

  describe('register', () => {
    it('creates a verification token and emails it on registration', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: USER_ID,
        email: 'new@example.com',
        firstName: 'Pat',
      });

      const res = await service.register({
        email: 'New@Example.com',
        password: 'a-strong-password-123',
        addressLine1: '123 Main St',
        city: 'Springfield',
        region: 'IL',
        postalCode: '62704',
        country: 'US',
      } as any);

      expect(res).toEqual({ id: USER_ID, email: 'new@example.com' });
      expect(prisma.emailVerificationToken.create).toHaveBeenCalledTimes(1);
      const data = prisma.emailVerificationToken.create.mock.calls[0][0].data;
      expect(data.tokenHash).toBe('hash(RAW-RANDOM-TOKEN)');
      expect(email.sendEmailVerification).toHaveBeenCalledWith(
        { email: 'new@example.com', firstName: 'Pat' },
        'RAW-RANDOM-TOKEN',
      );
    });
  });

  describe('verifyEmail', () => {
    it('marks the email verified and activates the user (happy path)', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'ev-1',
        userId: USER_ID,
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await service.verifyEmail('RAW-RANDOM-TOKEN');

      const userUpdate = prisma.user.update.mock.calls[0][0];
      expect(userUpdate.where).toEqual({ id: USER_ID });
      expect(userUpdate.data.state).toBe('ACTIVE');
      expect(userUpdate.data.emailVerifiedAt).toBeInstanceOf(Date);
      expect(prisma.emailVerificationToken.update).toHaveBeenCalledWith({
        where: { id: 'ev-1' },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('rejects an expired or used verification token', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'ev-1',
        userId: USER_ID,
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.verifyEmail('RAW-RANDOM-TOKEN')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('resendVerification', () => {
    it('re-issues for a pending (unverified) user', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: USER_ID,
        email: 'u@example.com',
        firstName: null,
        emailVerifiedAt: null,
      });
      await service.resendVerification('u@example.com');
      expect(prisma.emailVerificationToken.create).toHaveBeenCalledTimes(1);
      expect(email.sendEmailVerification).toHaveBeenCalledTimes(1);
    });

    it('is a no-op for an already-verified or unknown user (no enumeration)', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: USER_ID,
        email: 'u@example.com',
        emailVerifiedAt: new Date(),
      });
      await service.resendVerification('u@example.com');
      expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();

      prisma.user.findFirst.mockResolvedValue(null);
      await service.resendVerification('ghost@example.com');
      expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
    });
  });

  // ---- MFA challenge token -------------------------------------------------

  describe('MFA challenge token', () => {
    it('issues a token that decodes back to the same userId', async () => {
      const token = await service.issueMfaChallenge(USER_ID);
      // It must NOT be the raw user id.
      expect(token).not.toBe(USER_ID);
      const decoded = jwt.decode(token) as any;
      expect(decoded.type).toBe('mfa');
      expect(decoded.sub).toBe(USER_ID);

      const resolved = await service.verifyMfaChallenge(token);
      expect(resolved).toBe(USER_ID);
    });

    it('rejects the raw user id as a challenge token', async () => {
      await expect(service.verifyMfaChallenge(USER_ID)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a tampered token', async () => {
      const token = await service.issueMfaChallenge(USER_ID);
      const tampered = token.slice(0, -3) + 'aaa';
      await expect(service.verifyMfaChallenge(tampered)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an expired token', async () => {
      const expired = await jwt.signAsync(
        { sub: USER_ID, type: 'mfa' },
        { secret: MFA_SECRET, expiresIn: -1 },
      );
      await expect(service.verifyMfaChallenge(expired)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a wrong-type token (e.g. an access token) signed with another secret', async () => {
      const accessLike = await jwt.signAsync(
        { sub: USER_ID, type: 'access' },
        { secret: 'a', expiresIn: 900 },
      );
      await expect(service.verifyMfaChallenge(accessLike)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a token of wrong type even if signed with the MFA secret', async () => {
      const wrongType = await jwt.signAsync(
        { sub: USER_ID, type: 'access' },
        { secret: MFA_SECRET, expiresIn: 300 },
      );
      await expect(service.verifyMfaChallenge(wrongType)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
