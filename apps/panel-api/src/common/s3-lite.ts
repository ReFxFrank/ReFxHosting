import { EMPTY_PAYLOAD_SHA256, amzDateNow, signv4, uriEncode } from './aws-sigv4';

/**
 * Read-only S3/R2 object listing with no SDK dependency. Signs ListObjectsV2
 * GETs with SigV4 (aws-sigv4.ts) and parses the XML with focused regexes —
 * the ListObjectsV2 response shape is simple and stable. Used to report the
 * panel-DB backup bucket's usage in the admin storage overview.
 */

export interface S3ListConfig {
  endpoint: string; // e.g. https://<acct>.r2.cloudflarestorage.com
  region: string; // "auto" for R2
  bucket: string;
  accessKey: string;
  secretKey: string;
  /** Path-style (bucket in the path). R2 supports it and it avoids DNS-per-bucket. */
  usePathStyle: boolean;
}

export interface S3Object {
  key: string;
  size: number;
  lastModified: string;
}

export interface S3Listing {
  objects: S3Object[];
  totalBytes: number;
}

const CONTENTS_RE =
  /<Contents>[\s\S]*?<Key>([\s\S]*?)<\/Key>[\s\S]*?<LastModified>([\s\S]*?)<\/LastModified>[\s\S]*?<Size>(\d+)<\/Size>[\s\S]*?<\/Contents>/g;

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * List every object under `prefix` (paginating ListObjectsV2). Throws on any
 * non-2xx or network error so callers can fail-soft with context.
 */
export async function listObjects(
  config: S3ListConfig,
  prefix: string,
  opts: { timeoutMs?: number; maxPages?: number } = {},
): Promise<S3Listing> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxPages = opts.maxPages ?? 50; // 50 * 1000 keys — ample for backups
  const base = config.endpoint.replace(/\/$/, '');
  const host = new URL(base).host;
  const basePath = config.usePathStyle ? `/${config.bucket}` : '/';

  const objects: S3Object[] = [];
  let continuationToken: string | undefined;
  let totalBytes = 0;

  for (let page = 0; page < maxPages; page++) {
    const query: Record<string, string> = {
      'list-type': '2',
      'max-keys': '1000',
      prefix,
    };
    if (continuationToken) query['continuation-token'] = continuationToken;

    const amzDate = amzDateNow();
    const headers: Record<string, string> = {
      Host: host,
      'X-Amz-Date': amzDate,
      'X-Amz-Content-Sha256': EMPTY_PAYLOAD_SHA256,
    };
    const authorization = signv4({
      method: 'GET',
      path: basePath,
      query,
      headers,
      payloadHash: EMPTY_PAYLOAD_SHA256,
      region: config.region || 'auto',
      service: 's3',
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      amzDate,
    });

    // Use the SAME encoder as the canonical query in signv4 so the wire query
    // string can never diverge from what was signed (mismatch → SignatureDoesNotMatch).
    const qs = Object.keys(query)
      .sort()
      .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
      .join('&');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let xml: string;
    try {
      const res = await fetch(`${base}${basePath}?${qs}`, {
        method: 'GET',
        headers: { ...headers, Authorization: authorization },
        signal: controller.signal,
      });
      const body = await res.text();
      if (!res.ok) {
        // R2/S3 errors are XML: <Error><Code>..</Code><Message>..</Message></Error>.
        // Surface the code+message so the caller can show the real cause.
        const code = body.match(/<Code>([\s\S]*?)<\/Code>/)?.[1];
        const msg = body.match(/<Message>([\s\S]*?)<\/Message>/)?.[1];
        const detail = code
          ? `${code}${msg ? `: ${msg}` : ''}`
          : body.slice(0, 200).replace(/\s+/g, ' ').trim();
        throw new Error(`HTTP ${res.status} — ${detail}`);
      }
      xml = body;
    } finally {
      clearTimeout(timer);
    }

    CONTENTS_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CONTENTS_RE.exec(xml)) !== null) {
      const size = Number(m[3]);
      objects.push({
        key: decodeXml(m[1]),
        lastModified: m[2],
        size,
      });
      totalBytes += size;
    }

    const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
    const next = xml.match(
      /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/,
    );
    if (!truncated || !next) break;
    continuationToken = decodeXml(next[1]);
  }

  return { objects, totalBytes };
}
