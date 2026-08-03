import { describe, expect, it } from "vitest";
import { applyEdits, findEntry, parseConfig } from "./index";
import { decodeToDraft, encodeFromDraft } from "./values";
import type { ConfigFieldMeta } from "../config-files";

/** Lines that differ between two versions of a file, as `index: before → after`. */
function changedLines(before: string, after: string): string[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const out: string[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) out.push(`${i}: ${a[i] ?? "<none>"} → ${b[i] ?? "<none>"}`);
  }
  return out;
}

const ARMA_CFG = `// ReFx Hosting — Arma 3 server.cfg
hostname = "My ""Best"" Server";
password = "";
passwordAdmin = "secret";
maxPlayers = 32;

motd[] = {
  "Welcome",
  "Have fun"
};
motdInterval = 5;

verifySignatures = 2;
persistent = 1;
voteThreshold = 0.33;
forcedDifficulty = "veteran";

/* mission rotation — the form never touches class blocks */
class Missions {
  class Mission1 {
    template = "MyMission.Altis";
    persistent = 0;
  };
};

headlessClients[] = {"127.0.0.1"};
localClient[] = {"127.0.0.1"};
`;

const TOML_CFG = `# BeamMP
[General]
Name = "My server" # shown in the list
Port = 30814
Description = "Fun # times"
MaxPlayers = 8
Private = true

[Misc]
SendErrors = true
`;

const PROPERTIES = `#Minecraft server properties
motd=A Minecraft Server
max-players=20
view-distance=10
enable-rcon=false
`;

const PZ_INI = `PublicName=My PZ server
MaxPlayers=32
DefaultPort=16261
Mods=
PVP=true
`;

describe("cfg (Arma) parser", () => {
  const doc = parseConfig("cfg", ARMA_CFG);

  it("parses cleanly and indexes only top-level keys", () => {
    expect(doc.issues).toEqual([]);
    const keys = doc.entries.map((e) => e.key);
    expect(keys).toContain("hostname");
    expect(keys).toContain("motd");
    expect(keys).toContain("headlessClients");
    // `template` lives inside `class Missions` and must not be editable.
    expect(keys).not.toContain("template");
    // `persistent` appears at the top level AND inside the class block; only
    // the top-level one is indexed, so it isn't reported as a duplicate.
    expect(keys.filter((k) => k === "persistent")).toHaveLength(1);
  });

  it("captures values verbatim, including multi-line arrays", () => {
    expect(findEntry(doc, "hostname")?.raw).toBe('"My ""Best"" Server"');
    expect(findEntry(doc, "maxPlayers")?.raw).toBe("32");
    expect(findEntry(doc, "motd")?.array).toBe(true);
    expect(findEntry(doc, "motd")?.raw).toBe(
      '{\n  "Welcome",\n  "Have fun"\n}',
    );
  });

  it("round-trips byte-for-byte with no edits", () => {
    expect(applyEdits(doc, [])).toBe(ARMA_CFG);
  });

  it("round-trips byte-for-byte when every value is rewritten unchanged", () => {
    const edits = doc.entries.map((e) => ({
      key: e.key,
      raw: e.raw,
      array: e.array,
    }));
    expect(applyEdits(doc, edits)).toBe(ARMA_CFG);
  });

  it("edits exactly one line and leaves the class block alone", () => {
    const out = applyEdits(doc, [{ key: "verifySignatures", raw: "0" }]);
    expect(changedLines(ARMA_CFG, out)).toEqual([
      "12: verifySignatures = 2; → verifySignatures = 0;",
    ]);
    expect(out).toContain("    persistent = 0;");
  });

  it("edits the top-level key, not the one inside the class block", () => {
    const out = applyEdits(doc, [{ key: "persistent", raw: "0" }]);
    expect(changedLines(ARMA_CFG, out)).toEqual([
      "13: persistent = 1; → persistent = 0;",
    ]);
  });

  it("appends a missing key with the Arma array form", () => {
    const out = applyEdits(doc, [
      { key: "admins", raw: '{"76561198000000000"}', array: true },
    ]);
    expect(out.startsWith(ARMA_CFG)).toBe(true);
    expect(out.slice(ARMA_CFG.length)).toBe(
      'admins[] = {"76561198000000000"};\n',
    );
  });

  it("preserves CRLF line endings", () => {
    const crlf = ARMA_CFG.replace(/\n/g, "\r\n");
    const crlfDoc = parseConfig("cfg", crlf);
    expect(applyEdits(crlfDoc, [])).toBe(crlf);
    const out = applyEdits(crlfDoc, [{ key: "maxPlayers", raw: "64" }]);
    expect(out).toContain("maxPlayers = 64;\r\n");
    expect(out.split("\r\n").length).toBe(crlf.split("\r\n").length);
  });

  it("does not invent a trailing newline when appending to a file without one", () => {
    const noNewline = "hostname = \"x\";";
    const out = applyEdits(parseConfig("cfg", noNewline), [
      { key: "maxPlayers", raw: "10" },
    ]);
    expect(out).toBe('hostname = "x";\nmaxPlayers = 10;');
  });

  it("flags files it cannot edit safely", () => {
    expect(parseConfig("cfg", 'hostname = "a";\nhostname = "b";\n').issues)
      .toHaveLength(1);
    expect(parseConfig("cfg", 'hostname = "unterminated;\n').issues)
      .not.toHaveLength(0);
    expect(parseConfig("cfg", "class X {\n  a = 1;\n").issues)
      .not.toHaveLength(0);
  });
});

describe("toml parser", () => {
  const doc = parseConfig("toml", TOML_CFG);

  it("indexes keys per section and round-trips unchanged", () => {
    expect(doc.issues).toEqual([]);
    expect(findEntry(doc, "Name", "General")?.raw).toBe('"My server"');
    expect(findEntry(doc, "SendErrors", "Misc")?.raw).toBe("true");
    expect(applyEdits(doc, [])).toBe(TOML_CFG);
  });

  it("keeps a trailing comment when the value changes", () => {
    const out = applyEdits(doc, [
      { key: "Name", section: "General", raw: '"Renamed"' },
    ]);
    expect(changedLines(TOML_CFG, out)).toEqual([
      '2: Name = "My server" # shown in the list → Name = "Renamed" # shown in the list',
    ]);
  });

  it("treats a # inside a quoted string as part of the value", () => {
    expect(findEntry(doc, "Description", "General")?.raw).toBe('"Fun # times"');
  });

  it("adds a missing key at the end of its own section", () => {
    const out = applyEdits(doc, [
      { key: "Tags", section: "General", raw: '"racing"' },
    ]);
    expect(out).toBe(
      TOML_CFG.replace(
        "Private = true\n\n[Misc]",
        'Private = true\nTags = "racing"\n\n[Misc]',
      ),
    );
  });

  it("creates the section when it is missing", () => {
    const out = applyEdits(doc, [
      { key: "Key", section: "Brand New", raw: "1" },
    ]);
    expect(out).toBe(`${TOML_CFG}[Brand New]\nKey = 1\n`);
  });

  it("refuses multi-line values rather than corrupting them", () => {
    const doc2 = parseConfig("toml", 'List = [\n  "a",\n]\n');
    expect(doc2.issues).not.toHaveLength(0);
  });
});

describe("properties and ini parsers", () => {
  it("round-trips properties unchanged and edits one line", () => {
    const doc = parseConfig("properties", PROPERTIES);
    expect(doc.issues).toEqual([]);
    expect(applyEdits(doc, [])).toBe(PROPERTIES);
    const out = applyEdits(doc, [{ key: "view-distance", raw: "8" }]);
    expect(changedLines(PROPERTIES, out)).toEqual([
      "3: view-distance=10 → view-distance=8",
    ]);
  });

  it("keeps an empty value editable", () => {
    const doc = parseConfig("ini", PZ_INI);
    const mods = findEntry(doc, "Mods");
    expect(mods?.raw).toBe("");
    const out = applyEdits(doc, [{ key: "Mods", raw: "ModA;ModB" }]);
    expect(changedLines(PZ_INI, out)).toEqual(["3: Mods= → Mods=ModA;ModB"]);
  });

  it("inserts into the right ini section rather than after the next header", () => {
    const ini = "[A]\nOne=1\n\n[B]\nTwo=2\n";
    const doc = parseConfig("ini", ini);
    const out = applyEdits(doc, [{ key: "Three", section: "A", raw: "3" }]);
    expect(out).toBe("[A]\nOne=1\nThree=3\n\n[B]\nTwo=2\n");
  });

  it("keeps a Palworld-style single-line tuple intact", () => {
    const ini =
      "[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(Difficulty=None,DayTimeSpeedRate=1.000000)\n";
    const doc = parseConfig("ini", ini);
    expect(applyEdits(doc, [])).toBe(ini);
  });
});

describe("value codec", () => {
  const field = (over: Partial<ConfigFieldMeta>): ConfigFieldMeta => ({
    key: "k",
    label: "K",
    type: "string",
    ...over,
  });

  it("quotes cfg strings and doubles embedded quotes", () => {
    const encoded = encodeFromDraft("cfg", field({}), 'say "hi"');
    expect(encoded).toEqual({ raw: '"say ""hi"""' });
    expect(decodeToDraft("cfg", field({}), '"say ""hi"""').draft).toBe(
      'say "hi"',
    );
  });

  it("writes cfg booleans as 1/0 and toml booleans as true/false", () => {
    expect(encodeFromDraft("cfg", field({ type: "bool" }), "true")).toEqual({
      raw: "1",
    });
    expect(encodeFromDraft("toml", field({ type: "bool" }), "false")).toEqual({
      raw: "false",
    });
    expect(decodeToDraft("cfg", field({ type: "bool" }), "1").draft).toBe("true");
  });

  it("serialises arrays per format", () => {
    const arr = field({ type: "string[]" });
    expect(encodeFromDraft("cfg", arr, "a\nb")).toEqual({ raw: '{"a", "b"}' });
    expect(encodeFromDraft("toml", arr, "a\nb")).toEqual({ raw: '["a", "b"]' });
    expect(decodeToDraft("cfg", arr, '{"a", "b"}').draft).toBe("a\nb");
    expect(encodeFromDraft("cfg", arr, "")).toEqual({ raw: "{}" });
  });

  it("rejects values that don't match the field type", () => {
    expect(encodeFromDraft("cfg", field({ type: "int" }), "12x")).toEqual({
      error: "Must be a whole number.",
    });
    expect(
      encodeFromDraft("cfg", field({ type: "int", max: 3 }), "9"),
    ).toEqual({ error: "Must be 3 or less." });
    expect(encodeFromDraft("cfg", field({ type: "float" }), "abc")).toEqual({
      error: "Must be a number.",
    });
    expect(
      encodeFromDraft("cfg", field({ type: "enum", options: ["a"] }), "b"),
    ).toEqual({ error: "Pick one of the listed values." });
    expect(encodeFromDraft("cfg", field({}), "line\nbreak")).toEqual({
      error: "This value must stay on one line.",
    });
  });

  it("flags values that don't fit the declared type instead of rewriting them", () => {
    expect(decodeToDraft("cfg", field({ type: "int" }), "nope")).toEqual({
      draft: "nope",
      recognised: false,
    });
  });

  it("matches enum values case-insensitively and shows the catalog spelling", () => {
    const enumField = field({ type: "enum", options: ["Veteran", "Regular"] });
    expect(decodeToDraft("cfg", enumField, '"veteran"')).toEqual({
      draft: "Veteran",
      recognised: true,
    });
    expect(encodeFromDraft("cfg", enumField, "Veteran")).toEqual({
      raw: '"Veteran"',
    });
  });

  it("leaves numeric enums unquoted", () => {
    const enumField = field({ type: "enum", options: ["0", "1", "2"] });
    expect(encodeFromDraft("cfg", enumField, "2")).toEqual({ raw: "2" });
  });
});
