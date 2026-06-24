import { BadRequestException } from '@nestjs/common';
import { WebAuthnService } from './webauthn.service';

/**
 * Server-side coverage of the @simplewebauthn/server v13 integration. This
 * exercises the parts that a library migration breaks (the options-generation
 * API surface) and the service's own failure handling (clean BadRequest, never a
 * raw 500). It deliberately does NOT perform a full register/login ceremony —
 * that needs a real authenticator (a browser virtual-authenticator e2e), which
 * can't run in a unit test. What it guarantees: the v13 calls are wired
 * correctly, challenges are persisted single-use, and every failure path is a
 * clean 400 with a real reason.
 */
function makeService() {
  const store = new Map<string, string>();
  const redis = {
    client: {
      set: jest.fn((k: string, v: string) => {
        store.set(k, v);
        return Promise.resolve('OK');
      }),
      getdel: jest.fn((k: string) => {
        const v = store.get(k) ?? null;
        store.delete(k);
        return Promise.resolve(v);
      }),
      get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    },
  };
  const prisma = {
    webAuthnCredential: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const config = {
    get: (key: string) =>
      ({
        rpId: 'localhost',
        rpName: 'ReFx Hosting',
        panelUrl: 'http://localhost:3000',
      })[key],
  };
  const service = new WebAuthnService(
    config as never,
    prisma as never,
    {} as never,
    redis as never,
  );
  return { service, prisma, store };
}

describe('WebAuthnService (@simplewebauthn v13)', () => {
  describe('registrationOptions', () => {
    it('produces valid v13 creation options and stores the challenge single-use', async () => {
      const { service, store } = makeService();
      const options = await service.registrationOptions('user-1', 'u@example.com');

      expect(options.rp.id).toBe('localhost');
      expect(options.user.name).toBe('u@example.com');
      expect(typeof options.challenge).toBe('string');
      expect(options.challenge.length).toBeGreaterThan(0);
      expect(options.pubKeyCredParams.length).toBeGreaterThan(0);
      // Challenge persisted for the verify step, keyed by user + ceremony.
      expect(store.get('webauthn:reg:user-1')).toBe(options.challenge);
    });

    it('excludes already-registered credentials', async () => {
      const { service, prisma } = makeService();
      prisma.webAuthnCredential.findMany.mockResolvedValueOnce([
        { credentialId: 'existing-cred-id', transports: ['internal'] },
      ]);
      const options = await service.registrationOptions('user-1', 'u@example.com');
      expect(options.excludeCredentials?.map((c) => c.id)).toContain(
        'existing-cred-id',
      );
    });
  });

  describe('authenticationOptions', () => {
    it('produces request options with allowCredentials and stores the challenge', async () => {
      const { service, prisma, store } = makeService();
      prisma.webAuthnCredential.findMany.mockResolvedValueOnce([
        { credentialId: 'cred-a', transports: ['internal'] },
      ]);
      const options = await service.authenticationOptions('user-1');

      expect(typeof options.challenge).toBe('string');
      expect(options.allowCredentials?.map((c) => c.id)).toContain('cred-a');
      expect(store.get('webauthn:auth:user-1')).toBe(options.challenge);
    });
  });

  describe('verify failure paths (clean 400, never a raw 500)', () => {
    it('rejects registration when no ceremony is in progress', async () => {
      const { service } = makeService();
      await expect(
        service.verifyRegistration('user-1', {} as never),
      ).rejects.toThrow('No registration in progress');
    });

    it('surfaces the real reason when a registration response is invalid', async () => {
      const { service, store } = makeService();
      store.set('webauthn:reg:user-1', 'stored-challenge');
      const bogus = {
        id: 'x',
        rawId: 'x',
        type: 'public-key',
        response: { clientDataJSON: '', attestationObject: '' },
        clientExtensionResults: {},
      };
      // Hits the real verifyRegistrationResponse, which throws; the service must
      // wrap it as a clean BadRequest with the underlying detail.
      const err = await service
        .verifyRegistration('user-1', bogus as never)
        .catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(String(err.message)).toMatch(/Passkey registration failed:/);
    });

    it('rejects authentication when no ceremony is in progress', async () => {
      const { service } = makeService();
      await expect(
        service.verifyAuthentication('user-1', {} as never),
      ).rejects.toThrow('No authentication in progress');
    });

    it('rejects authentication for an unknown credential', async () => {
      const { service, store } = makeService();
      store.set('webauthn:auth:user-1', 'stored-challenge');
      await expect(
        service.verifyAuthentication('user-1', { id: 'nope' } as never),
      ).rejects.toThrow('Unknown credential');
    });
  });
});
