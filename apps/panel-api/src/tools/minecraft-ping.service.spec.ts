import { createServer, type Server, type Socket } from "node:net";
import { MinecraftPingService } from "./minecraft-ping.service";
import { encodeString, framePacket, readVarInt } from "./minecraft-ping.util";

/**
 * Protocol-level test: a fake Java-edition server on loopback speaking real
 * SLP framing. Calls the private ping() directly — the public status() path
 * correctly refuses loopback (covered below), so this exercises the wire
 * format without the SSRF guard.
 */

const STATUS = {
  version: { name: "Paper 1.21.1" },
  players: { online: 3, max: 20, sample: [{ name: "steve" }] },
  description: { text: "§bA test server", extra: [{ text: " with extras" }] },
};

function startFakeServer(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((socket: Socket) => {
      let buf = Buffer.alloc(0);
      socket.on("data", (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk]);
        // Wait until both handshake and status-request frames arrived.
        const first = readVarInt(buf, 0);
        if (!first || buf.length < first.size + first.value + 2) return;
        const payload = Buffer.concat([
          Buffer.from([0x00]),
          encodeString(JSON.stringify(STATUS)),
        ]);
        socket.write(framePacket(payload));
      });
    });
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: (server.address() as { port: number }).port });
    });
  });
}

describe("MinecraftPingService", () => {
  const service = new MinecraftPingService();

  it("completes a full SLP round trip against a real socket", async () => {
    const { server, port } = await startFakeServer();
    try {
      const { json, latencyMs } = await (
        service as unknown as {
          ping(a: string, h: string, p: number): Promise<{ json: typeof STATUS; latencyMs: number }>;
        }
      ).ping("127.0.0.1", "localhost", port);
      expect(json.version.name).toBe("Paper 1.21.1");
      expect(json.players.online).toBe(3);
      expect(latencyMs).toBeGreaterThanOrEqual(0);
    } finally {
      server.close();
    }
  });

  it("refuses loopback/private targets at the public entrypoint", async () => {
    for (const host of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "localhost"]) {
      const res = await service.status(host, 25565);
      expect(res.online).toBe(false);
    }
  });

  it("rejects malformed hosts and ports without touching the network", async () => {
    expect((await service.status("http://x", 1)).reason).toBe("Invalid host or port");
    expect((await service.status("ok.example.com", 0)).reason).toBe("Invalid host or port");
    expect((await service.status("ok.example.com", 70000)).reason).toBe("Invalid host or port");
  });
});
