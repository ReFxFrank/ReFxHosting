import {
  decryptSecret,
  encryptSecret,
  randomToken,
  sha256,
} from './crypto.util';

// 32-byte key as 64 hex chars.
const KEY = '0'.repeat(64);
const KEY2 = 'f'.repeat(64);

describe('crypto.util', () => {
  describe('AES-256-GCM encrypt/decrypt', () => {
    it('round-trips a plaintext back to the original', () => {
      const plaintext = 'super-secret-totp-seed';
      const enc = encryptSecret(plaintext, KEY);
      expect(decryptSecret(enc, KEY)).toBe(plaintext);
    });

    it('round-trips unicode and empty strings', () => {
      expect(decryptSecret(encryptSecret('', KEY), KEY)).toBe('');
      const u = 'pässwörd-✓-日本語';
      expect(decryptSecret(encryptSecret(u, KEY), KEY)).toBe(u);
    });

    it('produces a base64 payload of iv(12)+tag(16)+ciphertext', () => {
      const enc = encryptSecret('abc', KEY);
      const raw = Buffer.from(enc, 'base64');
      // 12 + 16 + len('abc')
      expect(raw.length).toBe(12 + 16 + 3);
    });

    it('uses a random IV so identical plaintexts yield different ciphertexts', () => {
      const a = encryptSecret('same', KEY);
      const b = encryptSecret('same', KEY);
      expect(a).not.toBe(b);
      expect(decryptSecret(a, KEY)).toBe('same');
      expect(decryptSecret(b, KEY)).toBe('same');
    });

    it('fails to decrypt with the wrong key (auth tag mismatch)', () => {
      const enc = encryptSecret('secret', KEY);
      expect(() => decryptSecret(enc, KEY2)).toThrow();
    });

    it('detects tampering with the ciphertext', () => {
      const enc = encryptSecret('secret-payload', KEY);
      const raw = Buffer.from(enc, 'base64');
      // Flip a bit in the ciphertext region (after iv+tag).
      raw[raw.length - 1] ^= 0x01;
      const tampered = raw.toString('base64');
      expect(() => decryptSecret(tampered, KEY)).toThrow();
    });

    it('detects tampering with the auth tag', () => {
      const enc = encryptSecret('secret-payload', KEY);
      const raw = Buffer.from(enc, 'base64');
      raw[12] ^= 0xff; // first byte of the 16-byte tag
      expect(() => decryptSecret(raw.toString('base64'), KEY)).toThrow();
    });

    it('rejects a key that is not 32 bytes', () => {
      expect(() => encryptSecret('x', 'abcd')).toThrow(/32 bytes/);
      expect(() => decryptSecret('x', 'abcd')).toThrow(/32 bytes/);
    });
  });

  describe('sha256', () => {
    it('produces the known digest for a fixed input', () => {
      expect(sha256('abc')).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
    });

    it('is deterministic and 64 hex chars', () => {
      const h = sha256('refx');
      expect(h).toBe(sha256('refx'));
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('randomToken', () => {
    it('returns a url-safe base64 string of the requested entropy', () => {
      const t = randomToken(32);
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
      // 32 bytes -> 43 base64url chars (no padding).
      expect(t.length).toBe(43);
    });

    it('is overwhelmingly unique across calls', () => {
      const set = new Set(Array.from({ length: 100 }, () => randomToken(16)));
      expect(set.size).toBe(100);
    });
  });
});
