import { Injectable, Logger } from "@nestjs/common";
import { lookup, resolveSrv } from "node:dns/promises";
import { Socket, isIP } from "node:net";
import {
  encodeString,
  encodeVarInt,
  flattenMotd,
  framePacket,
  isPublicAddress,
  isValidHost,
  readVarInt,
} from "./minecraft-ping.util";

/**
 * Java-edition Server List Ping for the public /tools status checker.
 *
 * SSRF posture: the hostname is resolved FIRST, every resolved address must
 * be globally routable, and the TCP connection is made to the vetted IP (not
 * the name) so a DNS-rebind between check and connect cannot redirect the
 * probe into the panel's network.
 */

const DEFAULT_PORT = 25565;
const TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 512 * 1024; // status JSON incl. favicon is ~50 KB
const MAX_SAMPLE = 12;

export interface McStatusResult {
  online: boolean;
  host: string;
  port: number;
  latencyMs?: number;
  version?: string;
  players?: { online: number; max: number; sample: string[] };
  motd?: string;
  favicon?: string;
  /** Human-readable reason when offline. Never leaks internals. */
  reason?: string;
}

interface StatusJson {
  version?: { name?: string };
  players?: {
    online?: number;
    max?: number;
    sample?: { name?: string }[];
  };
  description?: unknown;
  favicon?: string;
}

@Injectable()
export class MinecraftPingService {
  private readonly logger = new Logger(MinecraftPingService.name);

  async status(rawHost: string, rawPort?: number): Promise<McStatusResult> {
    const host = rawHost.trim().toLowerCase().replace(/\.$/, "");
    let port = rawPort ?? DEFAULT_PORT;

    if (!isValidHost(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
      return { online: false, host, port, reason: "Invalid host or port" };
    }

    // Like the vanilla client: honor an SRV record when the user gave a bare
    // domain on the default port.
    let target = host;
    if (!isIP(host) && (rawPort === undefined || rawPort === DEFAULT_PORT)) {
      try {
        const srv = await resolveSrv(`_minecraft._tcp.${host}`);
        if (srv.length > 0 && isValidHost(srv[0].name)) {
          target = srv[0].name.toLowerCase().replace(/\.$/, "");
          port = srv[0].port;
        }
      } catch {
        /* no SRV — connect directly */
      }
    }

    // Resolve, then vet every address before any connection.
    let address: string;
    if (isIP(target)) {
      address = target;
    } else {
      try {
        const addrs = await lookup(target, { all: true });
        if (addrs.length === 0) {
          return { online: false, host, port, reason: "Hostname does not resolve" };
        }
        if (addrs.some((a) => !isPublicAddress(a.address))) {
          return { online: false, host, port, reason: "Address is not publicly routable" };
        }
        // Prefer IPv4 — most game hosts and residential players are v4-first.
        address = (addrs.find((a) => a.family === 4) ?? addrs[0]).address;
      } catch {
        return { online: false, host, port, reason: "Hostname does not resolve" };
      }
    }
    if (!isPublicAddress(address)) {
      return { online: false, host, port, reason: "Address is not publicly routable" };
    }

    try {
      const { json, latencyMs } = await this.ping(address, target, port);
      const players = json.players ?? {};
      return {
        online: true,
        host,
        port,
        latencyMs,
        version: json.version?.name?.slice(0, 64),
        players: {
          online: players.online ?? 0,
          max: players.max ?? 0,
          sample: (players.sample ?? [])
            .map((p) => (p?.name ?? "").slice(0, 32))
            .filter(Boolean)
            .slice(0, MAX_SAMPLE),
        },
        motd: flattenMotd(json.description).slice(0, 300),
        favicon:
          typeof json.favicon === "string" && json.favicon.startsWith("data:image/png;base64,")
            ? json.favicon
            : undefined,
      };
    } catch (err) {
      this.logger.debug(`ping ${target}:${port} failed: ${(err as Error).message}`);
      return { online: false, host, port, reason: "Server is offline or unreachable" };
    }
  }

  /** One SLP round trip against a vetted IP. */
  private ping(
    address: string,
    hostForHandshake: string,
    port: number,
  ): Promise<{ json: StatusJson; latencyMs: number }> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      const started = Date.now();
      let buf = Buffer.alloc(0);
      let settled = false;

      const fail = (msg: string) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(new Error(msg));
      };

      socket.setTimeout(TIMEOUT_MS, () => fail("timeout"));
      socket.setNoDelay(true);
      socket.once("error", (e) => fail(e.message));

      socket.connect(port, address, () => {
        // Handshake (state → status), then the empty status request.
        const handshake = Buffer.concat([
          Buffer.from([0x00]),
          encodeVarInt(-1), // protocol version -1 = "just asking for status"
          encodeString(hostForHandshake),
          Buffer.from([(port >> 8) & 0xff, port & 0xff]),
          Buffer.from([0x01]),
        ]);
        socket.write(Buffer.concat([framePacket(handshake), framePacket(Buffer.from([0x00]))]));
      });

      socket.on("data", (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk]);
        if (buf.length > MAX_RESPONSE_BYTES) return fail("response too large");
        try {
          const frame = readVarInt(buf, 0);
          if (!frame) return; // need more bytes
          if (frame.value > MAX_RESPONSE_BYTES) return fail("response too large");
          if (buf.length < frame.size + frame.value) return; // packet incomplete
          let off = frame.size;
          const packetId = readVarInt(buf, off);
          if (!packetId || packetId.value !== 0x00) return fail("unexpected packet");
          off += packetId.size;
          const strLen = readVarInt(buf, off);
          if (!strLen) return;
          off += strLen.size;
          const jsonText = buf.subarray(off, off + strLen.value).toString("utf8");
          const json = JSON.parse(jsonText) as StatusJson;
          if (settled) return;
          settled = true;
          socket.destroy();
          resolve({ json, latencyMs: Date.now() - started });
        } catch (e) {
          fail((e as Error).message);
        }
      });

      socket.once("close", () => fail("connection closed"));
    });
  }
}
