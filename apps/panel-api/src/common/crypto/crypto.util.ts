import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto';

/**
 * AES-256-GCM encryption helpers for secrets at rest (TOTP seeds, SFTP/db
 * passwords, etc.). Output format (base64): iv(12) || authTag(16) || ciphertext.
 *
 * The key is a 32-byte value provided as a 64-char hex string via SECRETS_ENC_KEY.
 */

const IV_LEN = 12;
const TAG_LEN = 16;
const ALGO = 'aes-256-gcm';

function resolveKey(hexKey: string): Buffer {
  const key = Buffer.from(hexKey, 'hex');
  if (key.length !== 32) {
    throw new Error(
      `SECRETS_ENC_KEY must be 32 bytes (64 hex chars); got ${key.length} bytes`,
    );
  }
  return key;
}

export function encryptSecret(plaintext: string, hexKey: string): string {
  const key = resolveKey(hexKey);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptSecret(payload: string, hexKey: string): string {
  const key = resolveKey(hexKey);
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}

/** SHA-256 hex digest — used for refresh tokens, API keys, recovery codes. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Cryptographically random URL-safe token. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
