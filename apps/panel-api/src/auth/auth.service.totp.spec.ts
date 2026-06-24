import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { generateSecret, generateSync, createGuardrails } from 'otplib';
import { AuthService } from './auth.service';

/**
 * TOTP verify/enrollment logic in AuthService, exercised with real otplib
 * token generation. Prisma, JwtService, ConfigService and CryptoService are
 * mocked. CryptoService is a transparent stub: encrypt/decrypt are identity on
 * the secret so we can drive otplib directly.
 */
describe('AuthService TOTP', () => {
  let prisma: any;
  let jwt: any;
  let config: any;
  let crypto: any;
  let email: any;
  let service: AuthService;

  const USER_ID = 'user-1';

  beforeEach(() => {
    prisma = {
      user: {
        findFirstOrThrow: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
      },
      recoveryCode: {
        deleteMany: jest.fn((a: any) => a),
        create: jest.fn((a: any) => a),
      },
      webAuthnCredential: {
        // No passkeys by default — the login MFA gate only checks the count.
        count: jest.fn().mockResolvedValue(0),
      },
      session: { create: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
    config = {
      get: jest.fn((key: string) => {
        if (key === 'rpName') return 'ReFx Hosting';
        if (key === 'jwt') {
          return {
            accessSecret: 'a',
            refreshSecret: 'r',
            accessTtl: 900,
            refreshTtl: 86400,
            mfaSecret: 'mfa-secret',
            mfaTtl: 300,
          };
        }
        return undefined;
      }),
    };
    // Transparent crypto stub: secret stored/retrieved verbatim.
    crypto = {
      encrypt: jest.fn((s: string) => `enc(${s})`),
      decrypt: jest.fn((s: string) => s.replace(/^enc\(|\)$/g, '')),
      hash: jest.fn((s: string) => `hash(${s})`),
      token: jest.fn(() => 'ABCDE12345'),
    };

    email = {
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
      sendEmailVerification: jest.fn().mockResolvedValue(undefined),
      sendGeneric: jest.fn().mockResolvedValue(undefined),
    };

    service = new AuthService(prisma, jwt, config, crypto, email);
  });

  describe('totpVerify', () => {
    it('accepts a freshly generated valid token and issues recovery codes', async () => {
      const secret = generateSecret();
      prisma.user.findFirstOrThrow.mockResolvedValue({
        id: USER_ID,
        totpSecretEnc: `enc(${secret})`,
      });
      const code = generateSync({ secret });

      const result = await service.totpVerify(USER_ID, code);

      expect(result.recoveryCodes).toHaveLength(10);
      // The enrollment is activated atomically alongside recovery-code creation.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const batch = prisma.$transaction.mock.calls[0][0];
      // 1 user.update + 1 recoveryCode.deleteMany + 10 recoveryCode.create.
      expect(batch).toHaveLength(12);
    });

    it('rejects an invalid code without activating MFA', async () => {
      const secret = generateSecret();
      prisma.user.findFirstOrThrow.mockResolvedValue({
        id: USER_ID,
        totpSecretEnc: `enc(${secret})`,
      });
      await expect(service.totpVerify(USER_ID, '000000')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws when there is no pending enrollment', async () => {
      prisma.user.findFirstOrThrow.mockResolvedValue({
        id: USER_ID,
        totpSecretEnc: null,
      });
      await expect(service.totpVerify(USER_ID, '123456')).rejects.toThrow(
        /No TOTP enrollment/,
      );
    });

    it('persists hashed (never plaintext) recovery codes', async () => {
      const secret = generateSecret();
      prisma.user.findFirstOrThrow.mockResolvedValue({
        id: USER_ID,
        totpSecretEnc: `enc(${secret})`,
      });
      const code = generateSync({ secret });
      const { recoveryCodes } = await service.totpVerify(USER_ID, code);

      const createCalls = prisma.recoveryCode.create.mock.calls;
      expect(createCalls).toHaveLength(10);
      for (const [, ] of createCalls) {
        // each stored codeHash is the hash() of a plaintext, not the plaintext.
      }
      const storedHashes = createCalls.map((c: any[]) => c[0].data.codeHash);
      for (const plain of recoveryCodes) {
        expect(storedHashes).toContain(`hash(${plain})`);
      }
    });
  });

  describe('totpEnroll', () => {
    it('stores an encrypted secret and returns an otpauth URL', async () => {
      prisma.user.findFirstOrThrow.mockResolvedValue({
        id: USER_ID,
        email: 'u@example.com',
      });
      const result = await service.totpEnroll(USER_ID);
      expect(result.secret).toBeTruthy();
      expect(result.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
      expect(crypto.encrypt).toHaveBeenCalledWith(result.secret);
    });
  });

  describe('login MFA branch', () => {
    const argonHashOf = async (pw: string) => {
      const argon2 = await import('argon2');
      return argon2.hash(pw);
    };

    it('signals mfaRequired (without tokens) when MFA is enabled and no code is supplied', async () => {
      const secret = generateSecret();
      prisma.user.findFirst.mockResolvedValue({
        id: USER_ID,
        email: 'u@example.com',
        passwordHash: await argonHashOf('correct-horse'),
        state: 'ACTIVE',
        totpEnabledAt: new Date(),
        totpSecretEnc: `enc(${secret})`,
      });

      const res = await service.login(
        { email: 'u@example.com', password: 'correct-horse' },
        {},
      );
      expect(res.mfaRequired).toBe(true);
      expect(res.accessToken).toBe('');
      expect(prisma.session.create).not.toHaveBeenCalled();
    });

    it('rejects a wrong TOTP code at login', async () => {
      const secret = generateSecret();
      prisma.user.findFirst.mockResolvedValue({
        id: USER_ID,
        email: 'u@example.com',
        passwordHash: await argonHashOf('correct-horse'),
        state: 'ACTIVE',
        totpEnabledAt: new Date(),
        totpSecretEnc: `enc(${secret})`,
      });
      await expect(
        service.login(
          { email: 'u@example.com', password: 'correct-horse', totp: '000000' },
          {},
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('verifies a legacy otplib-12 (80-bit) secret at login instead of 500ing', async () => {
      // 16 base32 chars = 10 bytes, exactly what otplib 12's
      // authenticator.generateSecret() produced. otplib 13 rejects sub-128-bit
      // secrets unless the guardrail is relaxed (see TOTP_GUARDRAILS).
      const legacy = 'LEEBEYK2BVLX4LQ5';
      prisma.user.findFirst.mockResolvedValue({
        id: USER_ID,
        email: 'u@example.com',
        globalRole: 'USER',
        passwordHash: await argonHashOf('correct-horse'),
        state: 'ACTIVE',
        totpEnabledAt: new Date(),
        totpSecretEnc: `enc(${legacy})`,
      });
      const relaxed = createGuardrails({ MIN_SECRET_BYTES: 8 });
      const res = await service.login(
        {
          email: 'u@example.com',
          password: 'correct-horse',
          totp: generateSync({ secret: legacy, guardrails: relaxed }),
        },
        { ip: '1.2.3.4' },
      );
      expect(res.accessToken).toBe('signed.jwt.token');
    });

    it('issues tokens when password and TOTP are both valid', async () => {
      const secret = generateSecret();
      prisma.user.findFirst.mockResolvedValue({
        id: USER_ID,
        email: 'u@example.com',
        globalRole: 'USER',
        passwordHash: await argonHashOf('correct-horse'),
        state: 'ACTIVE',
        totpEnabledAt: new Date(),
        totpSecretEnc: `enc(${secret})`,
      });

      const res = await service.login(
        {
          email: 'u@example.com',
          password: 'correct-horse',
          totp: generateSync({ secret }),
        },
        { ip: '1.2.3.4' },
      );
      expect(res.accessToken).toBe('signed.jwt.token');
      expect(res.refreshToken).toBe('signed.jwt.token');
      expect(prisma.session.create).toHaveBeenCalledTimes(1);
    });
  });
});
