import {
  encodeVarInt,
  flattenMotd,
  isPublicAddress,
  isValidHost,
  readVarInt,
} from "./minecraft-ping.util";

describe("minecraft-ping utils", () => {
  describe("VarInt", () => {
    it("round-trips representative values", () => {
      for (const v of [0, 1, 127, 128, 255, 300, 25565, 2097151, 2147483647]) {
        const enc = encodeVarInt(v);
        expect(readVarInt(enc, 0)).toEqual({ value: v, size: enc.length });
      }
    });

    it("encodes -1 as the 5-byte wire form", () => {
      expect(encodeVarInt(-1)).toEqual(Buffer.from([0xff, 0xff, 0xff, 0xff, 0x0f]));
    });

    it("returns null on incomplete input and throws on overlong", () => {
      expect(readVarInt(Buffer.from([0x80]), 0)).toBeNull();
      expect(() =>
        readVarInt(Buffer.from([0x80, 0x80, 0x80, 0x80, 0x80, 0x80]), 0),
      ).toThrow("VarInt too long");
    });
  });

  describe("isPublicAddress (SSRF guard)", () => {
    const blocked = [
      "127.0.0.1",
      "10.0.0.5",
      "172.16.9.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata
      "100.64.0.1", // CGNAT
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
      "192.0.2.10", // doc range
      "198.18.0.1", // benchmarking
      "::1",
      "::",
      "fe80::1",
      "fd00::1",
      "fc00::1",
      "ff02::1",
      "::ffff:192.168.1.1", // mapped private
      "::ffff:10.0.0.1",
      "2001:db8::1",
      "64:ff9b::a00:1",
      "not-an-ip",
    ];
    it.each(blocked)("blocks %s", (ip) => {
      expect(isPublicAddress(ip)).toBe(false);
    });

    const allowed = [
      "93.184.216.34",
      "172.15.0.1",
      "172.32.0.1",
      "100.63.0.1",
      "100.128.0.1",
      "198.20.0.1",
      "2606:4700:4700::1111",
      "::ffff:93.184.216.34", // mapped public
    ];
    it.each(allowed)("allows %s", (ip) => {
      expect(isPublicAddress(ip)).toBe(true);
    });
  });

  describe("isValidHost", () => {
    it("accepts names and IPs, rejects junk", () => {
      expect(isValidHost("play.example.com")).toBe(true);
      expect(isValidHost("mc.hypixel.net")).toBe(true);
      expect(isValidHost("93.184.216.34")).toBe(true);
      expect(isValidHost("2606:4700::1")).toBe(true);
      expect(isValidHost("")).toBe(false);
      expect(isValidHost("http://example.com")).toBe(false);
      expect(isValidHost("host name")).toBe(false);
      expect(isValidHost("-bad.example.com")).toBe(false);
      expect(isValidHost("a".repeat(254))).toBe(false);
    });
  });

  describe("flattenMotd", () => {
    it("strips legacy codes from plain strings", () => {
      expect(flattenMotd("§aWelcome §lto §cthe server")).toBe("Welcome to the server");
    });

    it("flattens chat component trees", () => {
      expect(
        flattenMotd({
          text: "A ",
          extra: ["Minecraft ", { text: "Server", extra: [{ text: "!" }] }],
        }),
      ).toBe("A Minecraft Server!");
    });

    it("collapses newlines and control chars", () => {
      expect(flattenMotd("line one\nline two")).toBe("line one line two");
      expect(flattenMotd(null)).toBe("");
    });
  });
});
