import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { PalworldSettingsService } from "./palworld-settings.service";
import {
  applyUpdates,
  buildData,
  parseOptionSettings,
  replaceOptionSettingsLine,
  serializeOptionSettings,
} from "./palworld-settings.util";

/**
 * A representative real-world Palworld OptionSettings line: quoted strings
 * (ServerName with a space), floats (6dp), an int, enums, bools, the nested
 * CrossplayPlatforms tuple, secrets, AND a key we don't curate (foobar) that
 * must survive every round-trip.
 */
const REAL_LINE =
  'OptionSettings=(Difficulty=None,DayTimeSpeedRate=1.000000,ExpRate=1.500000,ServerPlayerMaxNum=16,DeathPenalty=All,bIsPvP=False,ServerName="My Palworld, Server",ServerPassword="hunter2",AdminPassword="s3cret",CrossplayPlatforms=(Steam,Xbox,PS5,Mac),ExtraModKey=42)';

const CONTENT = `[/Script/Pal.PalGameWorldSettings]\n${REAL_LINE}\n`;

describe("palworld-settings.util", () => {
  it("parses a real OptionSettings line and round-trips it byte-for-byte", () => {
    const pairs = parseOptionSettings(REAL_LINE);
    // Every key present, in order.
    expect(pairs.map((p) => p.key)).toEqual([
      "Difficulty",
      "DayTimeSpeedRate",
      "ExpRate",
      "ServerPlayerMaxNum",
      "DeathPenalty",
      "bIsPvP",
      "ServerName",
      "ServerPassword",
      "AdminPassword",
      "CrossplayPlatforms",
      "ExtraModKey",
    ]);
    // Raw values preserved exactly (incl. the comma + space inside the quoted
    // ServerName and the nested tuple).
    expect(pairs.find((p) => p.key === "ServerName")?.raw).toBe(
      '"My Palworld, Server"',
    );
    expect(pairs.find((p) => p.key === "CrossplayPlatforms")?.raw).toBe(
      "(Steam,Xbox,PS5,Mac)",
    );
    // Serialize back -> identical line.
    expect(serializeOptionSettings(pairs)).toBe(REAL_LINE);
  });

  it("decodes curated fields to typed values and masks secrets", () => {
    const { fields } = buildData(parseOptionSettings(REAL_LINE));
    expect(fields.Difficulty).toBe("None");
    expect(fields.DeathPenalty).toBe("All");
    expect(fields.ExpRate).toBe(1.5);
    expect(fields.ServerPlayerMaxNum).toBe(16);
    expect(fields.bIsPvP).toBe(false);
    expect(fields.ServerName).toBe("My Palworld, Server");
    expect(fields.CrossplayPlatforms).toEqual(["Steam", "Xbox", "PS5", "Mac"]);
    // Secrets never expose their value — only a set flag.
    expect(fields.ServerPassword).toEqual({ set: true });
    expect(fields.AdminPassword).toEqual({ set: true });
  });

  it("round-trips non-curated keys under extraKeys (never drops them)", () => {
    const { fields, extraKeys } = buildData(parseOptionSettings(REAL_LINE));
    expect(fields).not.toHaveProperty("ExtraModKey");
    expect(extraKeys).toContainEqual({ key: "ExtraModKey", value: "42" });
  });

  it("marks an absent secret as not set and an unset field as null", () => {
    const { fields } = buildData(parseOptionSettings("OptionSettings=()"));
    expect(fields.ServerPassword).toEqual({ set: false });
    expect(fields.ExpRate).toBeNull();
  });

  it("encodes float to 6dp, bool to True/False, string to a quoted, sanitized value", () => {
    const next = applyUpdates(parseOptionSettings("OptionSettings=()"), {
      ExpRate: 2,
      bIsPvP: true,
      ServerDescription: 'ab"c\ndef',
    });
    const map = new Map(next.map((p) => [p.key, p.raw]));
    expect(map.get("ExpRate")).toBe("2.000000");
    expect(map.get("bIsPvP")).toBe("True");
    // Quotes and control chars (the newline) stripped so the tuple can't break.
    expect(map.get("ServerDescription")).toBe('"abcdef"');
  });

  it("clamps ints, collapses tuple dupes, and validates enums/tuples", () => {
    const next = applyUpdates(parseOptionSettings("OptionSettings=()"), {
      DropItemMaxNum: 999999999,
      DeathPenalty: "Item",
      CrossplayPlatforms: ["Steam", "Steam", "Mac"],
    });
    const map = new Map(next.map((p) => [p.key, p.raw]));
    expect(map.get("DropItemMaxNum")).toBe("100000"); // clamped to max
    expect(map.get("DeathPenalty")).toBe("Item");
    expect(map.get("CrossplayPlatforms")).toBe("(Steam,Mac)"); // dupes collapsed
    // An invalid enum token is rejected...
    expect(() =>
      applyUpdates(parseOptionSettings("OptionSettings=()"), {
        DeathPenalty: "Nope",
      }),
    ).toThrow(/must be one of/);
    // ...and so is an invalid tuple member (the form only offers valid ones).
    expect(() =>
      applyUpdates(parseOptionSettings("OptionSettings=()"), {
        CrossplayPlatforms: ["Steam", "Bogus"],
      }),
    ).toThrow(/invalid value/);
  });

  it("skips panel-managed keys and empty secrets on write", () => {
    const next = applyUpdates(parseOptionSettings(REAL_LINE), {
      ServerName: "hacked", // managed -> ignored
      ServerPassword: "", // empty secret -> untouched
      ExpRate: 3,
    });
    const map = new Map(next.map((p) => [p.key, p.raw]));
    expect(map.get("ServerName")).toBe('"My Palworld, Server"'); // unchanged
    expect(map.get("ServerPassword")).toBe('"hunter2"'); // unchanged
    expect(map.get("ExpRate")).toBe("3.000000");
  });

  it("preserves unknown keys and only rewrites the OptionSettings line", () => {
    const withExtra = `; a comment\n[/Script/Pal.PalGameWorldSettings]\n${REAL_LINE}\n[Other]\nKeep=1\n`;
    const next = applyUpdates(parseOptionSettings(withExtra), { ExpRate: 4 });
    const out = replaceOptionSettingsLine(
      withExtra,
      serializeOptionSettings(next),
    );
    expect(out).toContain("; a comment");
    expect(out).toContain("[Other]\nKeep=1");
    expect(out).toContain("ExpRate=4.000000");
    // ExtraModKey (non-curated) still present after the write.
    expect(out).toContain("ExtraModKey=42");
  });

  it("does not over-capture into a LATER section that contains parens", () => {
    // Regression: a greedy cross-line regex used to swallow a trailing section
    // whose value ended in `)`, dropping its keys and corrupting the round-trip.
    const content = `${CONTENT}[/Script/Engine.GameSession]\nData=(1,2)\n`;
    const pairs = parseOptionSettings(content);
    // Only the OptionSettings line's keys are parsed; ServerName is clean (no
    // swallowed newline/section) and the Data key is NOT absorbed.
    expect(pairs.find((p) => p.key === "ServerName")?.raw).toBe(
      '"My Palworld, Server"',
    );
    expect(pairs.some((p) => p.key === "Data")).toBe(false);
    // A PATCH preserves the trailing section verbatim and stays single-line.
    const next = applyUpdates(pairs, { ExpRate: 2 });
    const out = replaceOptionSettingsLine(content, serializeOptionSettings(next));
    expect(out).toContain("[/Script/Engine.GameSession]\nData=(1,2)");
    expect(out).toContain("ExpRate=2.000000");
    const optLines = out.split("\n").filter((l) => l.startsWith("OptionSettings="));
    expect(optLines).toHaveLength(1); // exactly one, single-line tuple
  });

  it("ignores a commented-out OptionSettings line and edits the real one", () => {
    const content = `;OptionSettings=(Difficulty=Hard)\n${CONTENT}`;
    const pairs = parseOptionSettings(content);
    // Parsed from the REAL line (Difficulty=None), not the `;`-commented one.
    expect(pairs.find((p) => p.key === "Difficulty")?.raw).toBe("None");
    expect(pairs.length).toBeGreaterThan(1); // not dropped to []
    const next = applyUpdates(pairs, { ExpRate: 5 });
    const out = replaceOptionSettingsLine(content, serializeOptionSettings(next));
    expect(out).toContain(";OptionSettings=(Difficulty=Hard)"); // comment kept
    expect(out).toContain("ExpRate=5.000000");
  });

  it("rejects an absurd float magnitude (would serialize as exponential)", () => {
    expect(() =>
      applyUpdates(parseOptionSettings("OptionSettings=()"), { ExpRate: 1e21 }),
    ).toThrow(/out of range/);
  });

  it("rejects unknown curated keys", () => {
    expect(() =>
      applyUpdates(parseOptionSettings("OptionSettings=()"), {
        NotARealSetting: 1,
      }),
    ).toThrow(/Unknown Palworld setting/);
  });

  it("seeds a fresh file when no OptionSettings line exists", () => {
    const out = replaceOptionSettingsLine("", "OptionSettings=(ExpRate=1.000000)");
    expect(out).toBe(
      "[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(ExpRate=1.000000)\n",
    );
  });
});

describe("PalworldSettingsService", () => {
  const NODE = { id: "node-1" };
  let prisma: { server: { findFirst: jest.Mock } };
  let agent: { readFile: jest.Mock; writeFile: jest.Mock };
  let svc: PalworldSettingsService;

  const palServer = (over: Record<string, unknown> = {}) => ({
    id: "srv-1",
    state: "OFFLINE",
    node: NODE,
    template: { slug: "palworld" },
    ...over,
  });

  beforeEach(() => {
    prisma = { server: { findFirst: jest.fn() } };
    agent = {
      readFile: jest.fn().mockResolvedValue({ content: CONTENT }),
      writeFile: jest.fn().mockResolvedValue(undefined),
    };
    svc = new PalworldSettingsService(prisma as any, agent as any);
  });

  it("rejects a non-Palworld server", async () => {
    prisma.server.findFirst.mockResolvedValue(
      palServer({ template: { slug: "minecraft" } }),
    );
    await expect(svc.get("srv-1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws NotFound when the server is missing", async () => {
    prisma.server.findFirst.mockResolvedValue(null);
    await expect(svc.get("srv-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("GET returns typed fields with secrets masked and reports editability", async () => {
    prisma.server.findFirst.mockResolvedValue(palServer({ state: "OFFLINE" }));
    const view = await svc.get("srv-1");
    expect(view.editable).toBe(true);
    expect(view.state).toBe("OFFLINE");
    expect(view.managedKeys).toContain("ServerName");
    expect(view.managedKeys).toContain("AdminPassword");
    expect(view.fields.ServerPassword).toEqual({ set: true });
    expect(view.fields.ExpRate).toBe(1.5);
  });

  it("GET marks a running server as not editable", async () => {
    prisma.server.findFirst.mockResolvedValue(palServer({ state: "RUNNING" }));
    const view = await svc.get("srv-1");
    expect(view.editable).toBe(false);
  });

  it("PATCH throws 409 while the server is running (never writes)", async () => {
    prisma.server.findFirst.mockResolvedValue(palServer({ state: "RUNNING" }));
    await expect(svc.update("srv-1", { ExpRate: 2 })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(agent.writeFile).not.toHaveBeenCalled();
  });

  it("PATCH writes the merged ini while stopped, preserving unknown keys", async () => {
    prisma.server.findFirst.mockResolvedValue(palServer({ state: "CRASHED" }));
    const view = await svc.update("srv-1", { ExpRate: 2.25 });

    expect(agent.writeFile).toHaveBeenCalledTimes(1);
    const [, , path, written] = agent.writeFile.mock.calls[0];
    expect(path).toBe("Pal/Saved/Config/LinuxServer/PalWorldSettings.ini");
    expect(written).toContain("ExpRate=2.250000");
    expect(written).toContain("ExtraModKey=42"); // never dropped
    expect(written).toContain("[/Script/Pal.PalGameWorldSettings]");
    // The returned view reflects the new value, still masking secrets.
    expect(view.fields.ExpRate).toBe(2.25);
    expect(view.fields.ServerPassword).toEqual({ set: true });
  });

  it("PATCH surfaces a validation error as 400", async () => {
    prisma.server.findFirst.mockResolvedValue(palServer());
    await expect(
      svc.update("srv-1", { DeathPenalty: "Nope" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(agent.writeFile).not.toHaveBeenCalled();
  });

  it("PATCH throws NotFound when the ini has not been generated yet", async () => {
    prisma.server.findFirst.mockResolvedValue(palServer());
    agent.readFile.mockRejectedValue(new Error("no such file"));
    await expect(svc.update("srv-1", { ExpRate: 2 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
