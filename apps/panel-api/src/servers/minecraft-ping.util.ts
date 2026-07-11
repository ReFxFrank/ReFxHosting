import * as net from "net";

/**
 * Minimal Minecraft Java "Server List Ping" (SLP) client — the same status
 * handshake the vanilla client performs on the multiplayer screen. Works
 * against every loader (vanilla/Paper/Fabric/Forge/NeoForge) with no server
 * config: it needs only the public game port. Returns online/max counts and
 * the server's public *sample* of player names (vanilla sends up to 12;
 * empty when `hide-online-players=true`).
 */

/** Protocol varint: 32-bit int, 7 bits per byte, LSB-first, MSB = continue. */
export function writeVarInt(value: number): Buffer {
  const bytes: number[] = [];
  let v = value >>> 0; // encode two's-complement as unsigned
  for (;;) {
    if ((v & ~0x7f) === 0) {
      bytes.push(v);
      break;
    }
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  return Buffer.from(bytes);
}

export function readVarInt(
  buf: Buffer,
  offset = 0,
): { value: number; size: number } {
  let result = 0;
  let size = 0;
  for (;;) {
    if (offset + size >= buf.length) {
      throw new RangeError("varint: buffer underrun");
    }
    const b = buf[offset + size];
    result |= (b & 0x7f) << (7 * size);
    size += 1;
    if ((b & 0x80) === 0) break;
    if (size > 5) throw new RangeError("varint: too long");
  }
  return { value: result | 0, size };
}

/** Frame a packet: varint(total body length) + varint(packetId) + payload. */
function packet(id: number, payload: Buffer): Buffer {
  const body = Buffer.concat([writeVarInt(id), payload]);
  return Buffer.concat([writeVarInt(body.length), body]);
}

function protocolString(s: string): Buffer {
  const utf8 = Buffer.from(s, "utf8");
  return Buffer.concat([writeVarInt(utf8.length), utf8]);
}

/** Handshake (state 1 = status). Protocol version -1 = "just tell me". */
export function buildHandshake(host: string, port: number): Buffer {
  const portBuf = Buffer.alloc(2);
  portBuf.writeUInt16BE(port & 0xffff);
  return packet(
    0x00,
    Buffer.concat([
      writeVarInt(-1),
      protocolString(host),
      portBuf,
      writeVarInt(1),
    ]),
  );
}

export function buildStatusRequest(): Buffer {
  return packet(0x00, Buffer.alloc(0));
}

/**
 * Try to parse a complete status response out of an accumulation buffer.
 * Returns the JSON text, or null while the packet is still incomplete.
 */
export function parseStatusResponse(buf: Buffer): string | null {
  let len: { value: number; size: number };
  try {
    len = readVarInt(buf, 0);
  } catch {
    return null; // length prefix not fully received yet
  }
  if (buf.length < len.size + len.value) return null;
  const body = buf.subarray(len.size, len.size + len.value);
  const id = readVarInt(body, 0);
  if (id.value !== 0x00) {
    throw new Error(`unexpected status packet id 0x${id.value.toString(16)}`);
  }
  const strLen = readVarInt(body, id.size);
  const start = id.size + strLen.size;
  return body.subarray(start, start + strLen.value).toString("utf8");
}

export interface MinecraftStatus {
  online: number;
  max: number;
  /** Public sample of online player names (vanilla caps it at 12). */
  names: string[];
  version: string | null;
  latencyMs: number;
}

/** Strip legacy §-format codes (MOTD/version strings may carry them). */
function clean(s: string): string {
  return s.replace(/§./g, "");
}

/** Map the SLP JSON into our shape, defensively — it's remote input. */
export function extractStatus(
  json: unknown,
  latencyMs: number,
): MinecraftStatus {
  const root = (json ?? {}) as Record<string, unknown>;
  const players = (root.players ?? {}) as Record<string, unknown>;
  const version = (root.version ?? {}) as Record<string, unknown>;
  const sample = Array.isArray(players.sample) ? players.sample : [];
  const names = sample
    .map((p) => (p as Record<string, unknown>)?.name)
    .filter((n): n is string => typeof n === "string" && n.length > 0)
    .map(clean)
    .slice(0, 40);
  return {
    online: typeof players.online === "number" ? players.online : 0,
    max: typeof players.max === "number" ? players.max : 0,
    names,
    version: typeof version.name === "string" ? clean(version.name) : null,
    latencyMs,
  };
}

const MAX_RESPONSE_BYTES = 1024 * 1024; // status JSON is a few KB; 1 MiB = abuse

/** Perform a full SLP status ping. Rejects on timeout/refusal/garbage. */
export function pingMinecraft(
  host: string,
  port: number,
  timeoutMs = 3000,
): Promise<MinecraftStatus> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const socket = net.connect({ host, port });
    let buf = Buffer.alloc(0);
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err);
    };
    socket.setTimeout(timeoutMs, () => fail(new Error("ping timeout")));
    socket.on("error", fail);
    socket.on("connect", () => {
      socket.write(
        Buffer.concat([buildHandshake(host, port), buildStatusRequest()]),
      );
    });
    socket.on("data", (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length > MAX_RESPONSE_BYTES) {
        return fail(new Error("status response too large"));
      }
      let text: string | null;
      try {
        text = parseStatusResponse(buf);
      } catch (e) {
        return fail(e as Error);
      }
      if (text == null) return; // keep accumulating
      settled = true;
      socket.destroy();
      try {
        resolve(extractStatus(JSON.parse(text), Date.now() - started));
      } catch {
        reject(new Error("invalid status JSON"));
      }
    });
    socket.on("close", () => fail(new Error("connection closed")));
  });
}
