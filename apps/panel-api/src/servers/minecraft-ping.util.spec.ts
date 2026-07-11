import {
  buildHandshake,
  buildStatusRequest,
  extractStatus,
  parseStatusResponse,
  readVarInt,
  writeVarInt,
} from "./minecraft-ping.util";

describe("minecraft-ping varint", () => {
  it("round-trips protocol varints", () => {
    for (const v of [0, 1, 127, 128, 255, 25565, 2097151, 2147483647]) {
      const buf = writeVarInt(v);
      expect(readVarInt(buf, 0)).toEqual({ value: v, size: buf.length });
    }
  });

  it("encodes -1 (the 'any protocol' handshake version) as 5 bytes", () => {
    const buf = writeVarInt(-1);
    expect(buf.length).toBe(5);
    expect(readVarInt(buf, 0).value).toBe(-1);
  });

  it("throws on underrun instead of returning garbage", () => {
    expect(() => readVarInt(Buffer.from([0x80]), 0)).toThrow(RangeError);
  });
});

describe("minecraft-ping packets", () => {
  it("builds a well-formed status handshake", () => {
    const pkt = buildHandshake("mc.example.com", 25565);
    const frame = readVarInt(pkt, 0);
    // Frame length must cover exactly the rest of the packet.
    expect(frame.value).toBe(pkt.length - frame.size);
    const body = pkt.subarray(frame.size);
    const id = readVarInt(body, 0);
    expect(id.value).toBe(0x00);
    const proto = readVarInt(body, id.size);
    expect(proto.value).toBe(-1);
    const hostLen = readVarInt(body, id.size + proto.size);
    const hostStart = id.size + proto.size + hostLen.size;
    expect(
      body.subarray(hostStart, hostStart + hostLen.value).toString("utf8"),
    ).toBe("mc.example.com");
    expect(body.readUInt16BE(hostStart + hostLen.value)).toBe(25565);
    // Next state = 1 (status).
    expect(body[hostStart + hostLen.value + 2]).toBe(1);
  });

  it("status request is the empty 0x00 packet", () => {
    expect(buildStatusRequest()).toEqual(Buffer.from([0x01, 0x00]));
  });
});

describe("minecraft-ping response parsing", () => {
  const encode = (json: string): Buffer => {
    const str = Buffer.from(json, "utf8");
    const body = Buffer.concat([
      writeVarInt(0x00),
      writeVarInt(str.length),
      str,
    ]);
    return Buffer.concat([writeVarInt(body.length), body]);
  };

  it("returns null until the packet is complete, then the JSON text", () => {
    const json = JSON.stringify({ players: { online: 3, max: 20 } });
    const full = encode(json);
    // Feed byte-by-byte prefixes: never throws, yields null until complete.
    for (let i = 1; i < full.length; i++) {
      expect(parseStatusResponse(full.subarray(0, i))).toBeNull();
    }
    expect(parseStatusResponse(full)).toBe(json);
  });

  it("rejects a wrong packet id", () => {
    const str = Buffer.from("{}", "utf8");
    const body = Buffer.concat([
      writeVarInt(0x7f),
      writeVarInt(str.length),
      str,
    ]);
    const pkt = Buffer.concat([writeVarInt(body.length), body]);
    expect(() => parseStatusResponse(pkt)).toThrow(/packet id/);
  });
});

describe("minecraft-ping extractStatus", () => {
  it("maps counts, sample names, and version", () => {
    const s = extractStatus(
      {
        version: { name: "Paper 1.21.1", protocol: 767 },
        players: {
          online: 3,
          max: 20,
          sample: [
            { name: "Alice", id: "a" },
            { name: "Bob", id: "b" },
            { notName: true },
            { name: "" },
          ],
        },
        description: { text: "hi" },
      },
      42,
    );
    expect(s).toEqual({
      online: 3,
      max: 20,
      names: ["Alice", "Bob"],
      version: "Paper 1.21.1",
      latencyMs: 42,
    });
  });

  it("survives hidden players and junk payloads", () => {
    expect(extractStatus({ players: { online: 5, max: 10 } }, 1).names).toEqual(
      [],
    );
    expect(extractStatus(null, 1)).toEqual({
      online: 0,
      max: 0,
      names: [],
      version: null,
      latencyMs: 1,
    });
  });

  it("strips legacy § color codes", () => {
    const s = extractStatus(
      { version: { name: "§cRed§r 1.20" }, players: { online: 0, max: 0 } },
      1,
    );
    expect(s.version).toBe("Red 1.20");
  });
});
