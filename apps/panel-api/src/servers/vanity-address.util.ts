import { BadRequestException } from '@nestjs/common';

/**
 * Validation for purchased custom address labels (`<label>.<node.gameDomain>`).
 *
 * The rules are deliberately a strict subset of what buildAllocationAlias's
 * sanitizer accepts, so a stored label always round-trips through the alias
 * builder unchanged. Invalid input is REJECTED (never silently rewritten) so
 * the customer sees exactly the name they are buying.
 */

/** DNS label: 3-32 chars, lowercase alphanumerics + inner hyphens. */
const LABEL_RE = /^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])?$/;

/** 8 lowercase hex chars — the exact shape of every Server.shortId. Reserved in
 * both directions: a vanity label can never collide with any current or FUTURE
 * server's default address. */
const SHORTID_SHAPE_RE = /^[0-9a-f]{8}$/;

/**
 * Names nobody may buy: infrastructure hostnames (could shadow real services
 * under a customer-facing domain) and brand/staff impersonation. Checked after
 * normalization, case-insensitive exact match. Admins can extend the list via
 * the `features.vanityAddress.reservedWords` platform setting.
 */
export const RESERVED_VANITY_WORDS: readonly string[] = [
  // Infrastructure
  'www', 'mail', 'smtp', 'imap', 'pop', 'ftp', 'sftp', 'ssh', 'api', 'app',
  'panel', 'portal', 'node', 'nodes', 'ns', 'ns1', 'ns2', 'dns', 'mx',
  'status', 'cdn', 'proxy', 'vpn', 'gateway', 'router', 'localhost',
  'autoconfig', 'autodiscover', 'webmail', 'wildcard',
  // Brand / staff impersonation
  'refx', 'refxhosting', 'admin', 'administrator', 'root', 'official',
  'staff', 'support', 'moderator', 'mod', 'owner', 'billing', 'help',
  'security', 'abuse', 'system', 'noreply', 'no-reply',
];

/**
 * Normalize + validate a requested vanity label. Returns the normalized label
 * or throws BadRequestException with a customer-readable reason.
 */
export function validateVanityLabel(
  input: string,
  extraReserved: readonly string[] = [],
): string {
  const label = (input ?? '').trim().toLowerCase();
  if (!label) throw new BadRequestException('Enter the name you want.');
  if (label.length < 3 || label.length > 32) {
    throw new BadRequestException('Names must be 3-32 characters long.');
  }
  if (!LABEL_RE.test(label)) {
    throw new BadRequestException(
      'Names may only contain lowercase letters, numbers and hyphens, and cannot start or end with a hyphen.',
    );
  }
  // IDNA/punycode look-alikes ("xn--…", any "??--…" prefix) are confusable and
  // never legitimate here.
  if (label.startsWith('xn--') || /^..--/.test(label)) {
    throw new BadRequestException('That name is not allowed.');
  }
  // 8-hex-char labels share the namespace with every server's default shortId
  // address — reserving the whole shape prevents shadowing in both directions.
  if (SHORTID_SHAPE_RE.test(label)) {
    throw new BadRequestException(
      'Names that look like a default server ID (8 letters/digits a-f) are reserved.',
    );
  }
  const reserved = new Set(
    [...RESERVED_VANITY_WORDS, ...extraReserved].map((w) =>
      w.trim().toLowerCase(),
    ),
  );
  if (reserved.has(label)) {
    throw new BadRequestException('That name is reserved.');
  }
  return label;
}
