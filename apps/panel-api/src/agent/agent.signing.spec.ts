import { signRequest, signRequestRaw } from "./agent.signing";

describe("agent signing — query coverage flag", () => {
  const key = "node-key";
  const ts = "1700000000";
  const a = "/api/v1/servers/abc/files/write?path=%2Ffoo";
  const b = "/api/v1/servers/abc/files/write?path=%2Fetc%2Fpasswd";

  it("legacy (default) does NOT cover the query — same path, different query → same signature", () => {
    expect(signRequest(key, "POST", a, ts, "")).toBe(
      signRequest(key, "POST", b, ts, ""),
    );
  });

  it("includeQuery covers the query — different query → different signature", () => {
    expect(signRequest(key, "POST", a, ts, "", true)).not.toBe(
      signRequest(key, "POST", b, ts, "", true),
    );
  });

  it("raw-body signer honours includeQuery too", () => {
    const body = new Uint8Array([1, 2, 3]);
    expect(signRequestRaw(key, "POST", a, ts, body, true)).not.toBe(
      signRequestRaw(key, "POST", b, ts, body, true),
    );
  });

  // The Go agent verifies the query-signed form by reconstructing
  // `URL.Path + "?" + URL.RawQuery` from the received request. That must equal
  // the exact path string the panel signed, or query-signing breaks file ops
  // once it is enabled. Emulate the agent's reconstruction and assert the
  // signatures match across a range of percent-encoded query values.
  it("query-signed canonical survives the agent path/rawquery round-trip", () => {
    const cases = [
      "/api/v1/servers/abc/files/list?path=%2Ffoo%2Fbar",
      "/api/v1/servers/abc/files/write?path=%2Fetc%2Fpasswd",
      "/api/v1/servers/abc/reinstall?wipe=true",
      "/api/v1/servers/abc/files/read?path=%2Fworld%2Flevel.dat",
    ];
    for (const p of cases) {
      const u = new URL(`https://node.example${p}`);
      const reconstructed = u.pathname + u.search; // agent: Path + "?" + RawQuery
      expect(signRequest(key, "POST", reconstructed, ts, "", true)).toBe(
        signRequest(key, "POST", p, ts, "", true),
      );
    }
  });
});
