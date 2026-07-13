import { AwsClient } from 'aws4fetch';

/**
 * Read-only S3/R2 object listing. Signing is delegated to aws4fetch — a tiny,
 * dependency-free SigV4 implementation that's the de-facto standard for
 * talking to R2 from fetch (hand-rolled SigV4 passed AWS's test vectors but
 * tripped R2's stricter validation). We keep only the ListObjectsV2 XML
 * parsing here, which is simple and stable. Used to report the panel-DB backup
 * bucket's usage in the admin storage overview.
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

// Match each <Contents> block, then extract fields from WITHIN it. Extracting
// fields order-independently per block is essential: S3-compatible services
// (R2 included) don't all emit Key/LastModified/Size in the same order, and a
// single order-assuming regex will run past a block boundary and pair one
// object's key with the next object's size.
const CONTENTS_RE = /<Contents>([\s\S]*?)<\/Contents>/g;
const KEY_RE = /<Key>([\s\S]*?)<\/Key>/;
const SIZE_RE = /<Size>(\d+)<\/Size>/;
const LASTMOD_RE = /<LastModified>([\s\S]*?)<\/LastModified>/;

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
 * non-2xx (with the R2 error code/message) or network error so callers can
 * fail-soft with context.
 */
export async function listObjects(
  config: S3ListConfig,
  prefix: string,
  opts: { timeoutMs?: number; maxPages?: number } = {},
): Promise<S3Listing> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxPages = opts.maxPages ?? 50; // 50 * 1000 keys — ample for backups
  // An S3 API endpoint is scheme+host only. Some dashboards hand out the
  // endpoint with the bucket appended (…/r2.cloudflarestorage.com/<bucket>);
  // keeping that path would double the bucket and R2 answers ListObjectsV2
  // with NoSuchKey. Normalize to the origin so addressing is always clean.
  const base = new URL(config.endpoint).origin;
  const basePath = config.usePathStyle ? `/${config.bucket}` : '';

  const aws = new AwsClient({
    accessKeyId: config.accessKey,
    secretAccessKey: config.secretKey,
    region: config.region || 'auto',
    service: 's3',
  });

  const objects: S3Object[] = [];
  let continuationToken: string | undefined;
  let totalBytes = 0;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      'list-type': '2',
      'max-keys': '1000',
      prefix,
    });
    if (continuationToken) params.set('continuation-token', continuationToken);
    const url = `${base}${basePath}?${params.toString()}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let xml: string;
    try {
      const res = await aws.fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });
      const body = await res.text();
      if (!res.ok) {
        // R2/S3 errors are XML: <Error><Code>..</Code><Message>..</Message></Error>.
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
      const block = m[1];
      const keyMatch = block.match(KEY_RE);
      const sizeMatch = block.match(SIZE_RE);
      if (!keyMatch || !sizeMatch) continue;
      const size = Number(sizeMatch[1]);
      objects.push({
        key: decodeXml(keyMatch[1]),
        lastModified: block.match(LASTMOD_RE)?.[1] ?? '',
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
