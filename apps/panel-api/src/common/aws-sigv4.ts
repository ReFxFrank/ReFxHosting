import { createHash, createHmac } from 'node:crypto';

/**
 * Minimal AWS Signature Version 4 signer — no SDK, matching the codebase's
 * hand-rolled style (cf. the SDK-free APNs client). Enough to sign S3/R2 GET
 * requests for read-only bucket listing; not a general-purpose S3 client.
 *
 * Verified against AWS's published SigV4 "get-vanilla" test vector
 * (see aws-sigv4.spec.ts).
 */

export const EMPTY_PAYLOAD_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/**
 * RFC 3986 percent-encoding as AWS requires it: only A-Z a-z 0-9 - _ . ~ are
 * left as-is; everything else is uppercase-hex encoded. `/` is preserved only
 * when `encodeSlash` is false (used for the canonical URI path).
 */
export function uriEncode(input: string, encodeSlash = true): string {
  let out = '';
  for (const byte of Buffer.from(input, 'utf8')) {
    const isUnreserved =
      (byte >= 0x41 && byte <= 0x5a) || // A-Z
      (byte >= 0x61 && byte <= 0x7a) || // a-z
      (byte >= 0x30 && byte <= 0x39) || // 0-9
      byte === 0x2d || // -
      byte === 0x5f || // _
      byte === 0x2e || // .
      byte === 0x7e; // ~
    if (isUnreserved) {
      out += String.fromCharCode(byte);
    } else if (byte === 0x2f && !encodeSlash) {
      out += '/';
    } else {
      out += '%' + byte.toString(16).toUpperCase().padStart(2, '0');
    }
  }
  return out;
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

export interface SignInput {
  method: string;
  /** URL path already split from the query (e.g. "/refx-db-backups"). */
  path: string;
  /** Query params as a plain map (values pre-decoded). */
  query: Record<string, string>;
  /** Headers to sign — must include host and x-amz-date; lowercase or not. */
  headers: Record<string, string>;
  /** Hex SHA-256 of the request body (EMPTY_PAYLOAD_SHA256 for GET). */
  payloadHash: string;
  region: string;
  service: string;
  accessKey: string;
  secretKey: string;
  /** ISO basic format, e.g. 20150830T123600Z. */
  amzDate: string;
}

/** Returns the value for the `Authorization` header. */
export function signv4(input: SignInput): string {
  const dateStamp = input.amzDate.slice(0, 8);

  // --- canonical request ---
  const canonicalUri = input.path
    .split('/')
    .map((seg) => uriEncode(seg))
    .join('/');

  const canonicalQuery = Object.keys(input.query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(input.query[k])}`)
    .join('&');

  const lowerHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.headers)) {
    lowerHeaders[k.toLowerCase()] = String(v).trim().replace(/\s+/g, ' ');
  }
  const signedHeaderNames = Object.keys(lowerHeaders).sort();
  const canonicalHeaders = signedHeaderNames
    .map((k) => `${k}:${lowerHeaders[k]}\n`)
    .join('');
  const signedHeaders = signedHeaderNames.join(';');

  const canonicalRequest = [
    input.method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join('\n');

  // --- string to sign ---
  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    input.amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  // --- signature ---
  const kDate = hmac('AWS4' + input.secretKey, dateStamp);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, input.service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning)
    .update(stringToSign, 'utf8')
    .digest('hex');

  return (
    `AWS4-HMAC-SHA256 Credential=${input.accessKey}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`
  );
}

/** Current time in SigV4 basic format (YYYYMMDDThhmmssZ). */
export function amzDateNow(now = new Date()): string {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, '');
}
