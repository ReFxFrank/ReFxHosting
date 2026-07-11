import { isIP } from "node:net";

/**
 * Pure helpers for the public Minecraft Server List Ping tool. Kept free of
 * I/O so the SSRF guard and protocol framing are unit-testable.
 */

// ---------------------------------------------------------------------------
// VarInt (Minecraft protocol framing)
// ---------------------------------------------------------------------------

/** Encode a non-negative integer as a Minecraft VarInt. */
export function encodeVarInt(value: number): Buffer {
  const bytes: number[] = [];
  let v = value >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v !== 0) b |= 0x80;
    bytes.push(b);
  } while (v !== 0);
  return Buffer.from(bytes);
}

/**
 * Read a VarInt at `offset`. Returns null while the buffer is still too short
 * (streaming), throws on malformed input (>5 bytes).
 */
export function readVarInt(
  buf: Buffer,
  offset: number,
): { value: number; size: number } | null {
  let value = 0;
  let size = 0;
  for (;;) {
    if (offset + size >= buf.length) return null;
    const b = buf[offset + size];
    value |= (b & 0x7f) << (7 * size);
    size += 1;
    if ((b & 0x80) === 0) break;
    if (size > 5) throw new Error("VarInt too long");
  }
  return { value: value >>> 0, size };
}

/** Frame a packet: VarInt(length) + payload. */
export function framePacket(payload: Buffer): Buffer {
  return Buffer.concat([encodeVarInt(payload.length), payload]);
}

/** Protocol string: VarInt(byteLength) + UTF-8 bytes. */
export function encodeString(s: string): Buffer {
  const bytes = Buffer.from(s, "utf8");
  return Buffer.concat([encodeVarInt(bytes.length), bytes]);
}

// ---------------------------------------------------------------------------
// SSRF guard
// ---------------------------------------------------------------------------

/**
 * True only for globally routable unicast addresses. Everything private,
 * loopback, link-local, CGNAT, documentation, multicast or reserved is
 * rejected — this endpoint pings arbitrary user-supplied hosts and must
 * never be usable to probe the panel's own network.
 */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPublicV4(ip);
  if (family === 6) return isPublicV6(ip);
  return false;
}

function isPublicV4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT 100.64/10
  if (a === 169 && b === 254) return false; // link-local
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0) return false; // 192.0.0/24 + 192.0.2/24 doc
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51) return false; // 198.51.100/24 doc
  if (a === 203 && b === 0) return false; // 203.0.113/24 doc
  if (a >= 224) return false; // multicast + reserved + broadcast
  return true;
}

function isPublicV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // IPv4-mapped/compatible — defer to the embedded IPv4.
  const v4 = lower.match(/(?:^|:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4) return isPublicV4(v4[1]);
  // Expand enough to read the first hextet(s).
  if (lower === "::" || lower === "::1") return false;
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
    return false; // fe80::/10 link-local
  }
  if (lower.startsWith("fc") || lower.startsWith("fd")) return false; // fc00::/7 ULA
  if (lower.startsWith("ff")) return false; // multicast
  if (lower.startsWith("2001:db8")) return false; // documentation
  if (lower.startsWith("64:ff9b")) return false; // NAT64 — may map internals
  // Global unicast is 2000::/3 (first nibble 2 or 3).
  return lower.startsWith("2") || lower.startsWith("3");
}

/** Hostname sanity: a DNS name or IP literal, no schemes/paths/spaces. */
export function isValidHost(host: string): boolean {
  if (!host || host.length > 253) return false;
  if (isIP(host)) return true;
  return /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/i.test(host);
}

// ---------------------------------------------------------------------------
// MOTD flattening
// ---------------------------------------------------------------------------

interface ChatComponent {
  text?: string;
  extra?: (ChatComponent | string)[];
}

/**
 * The status `description` is either a legacy §-coded string or a chat
 * component tree. Flatten to plain text for the tool UI.
 */
export function flattenMotd(description: unknown): string {
  const raw = collect(description);
  // Strip legacy formatting codes (§x) and control chars.
  return raw
    .replace(/§[0-9a-fk-orx]/gi, "")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function collect(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(collect).join("");
  if (typeof node === "object") {
    const c = node as ChatComponent;
    return collect(c.text) + (c.extra ? c.extra.map(collect).join("") : "");
  }
  return "";
}
