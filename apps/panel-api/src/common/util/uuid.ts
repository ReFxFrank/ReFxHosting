import { randomBytes } from 'crypto';

/**
 * UUID v7 generator (time-sortable). The platform stores all primary keys as
 * UUID v7 generated app-side (see schema header). Implemented inline to avoid a
 * dependency that may not ship v7 on every uuid release line.
 *
 * Layout (RFC 9562): 48-bit unix-ms timestamp | version(7) | 12 rand |
 * variant(2) | 62 rand.
 */
export function uuidv7(): string {
  const ts = Date.now();
  const buf = randomBytes(16);

  // 48-bit big-endian timestamp
  buf[0] = (ts / 2 ** 40) & 0xff;
  buf[1] = (ts / 2 ** 32) & 0xff;
  buf[2] = (ts / 2 ** 24) & 0xff;
  buf[3] = (ts / 2 ** 16) & 0xff;
  buf[4] = (ts / 2 ** 8) & 0xff;
  buf[5] = ts & 0xff;

  // version 7
  buf[6] = (buf[6] & 0x0f) | 0x70;
  // variant 10xx
  buf[8] = (buf[8] & 0x3f) | 0x80;

  const hex = buf.toString('hex');
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-${hex.slice(20)}`
  );
}

/** Short, user-facing id derived from a uuid (first 8 hex chars). */
export function shortId(): string {
  return randomBytes(4).toString('hex');
}
