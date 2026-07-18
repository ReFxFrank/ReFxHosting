import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PalworldModsService } from "./palworld-mods.service";

/**
 * Unit tests for the UE4SS mod manager. Prisma + the node agent are mocked; the
 * service holds the logic (palworld-windows only, list/install/enable/delete via
 * the agent's jailed file ops, built-in protection, path-traversal guards).
 */
describe("PalworldModsService", () => {
  const NODE = { id: "node-1" };
  const MODS = "Pal/Binaries/Win64/ue4ss/Mods";
  let prisma: { server: { findFirst: jest.Mock } };
  let agent: {
    listFiles: jest.Mock;
    readFile: jest.Mock;
    writeFile: jest.Mock;
    deleteFiles: jest.Mock;
    decompressFile: jest.Mock;
  };
  let svc: PalworldModsService;

  const pwServer = (over: Record<string, unknown> = {}) => ({
    id: "srv-1",
    node: NODE,
    template: { slug: "palworld-windows" },
    ...over,
  });
  const d = (name: string) => ({ name, isDir: true, size: 0 });
  const f = (name: string, size = 1) => ({ name, isDir: false, size });

  const wireFs = (tree: Record<string, unknown[]>) =>
    agent.listFiles.mockImplementation(async (_n, _s, path: string) => {
      if (path in tree) return tree[path];
      throw new Error(`no dir ${path}`);
    });

  beforeEach(() => {
    prisma = {
      server: { findFirst: jest.fn().mockResolvedValue(pwServer()) },
    };
    agent = {
      listFiles: jest.fn(),
      readFile: jest.fn().mockRejectedValue(new Error("no mods.txt")),
      writeFile: jest.fn().mockResolvedValue(undefined),
      deleteFiles: jest.fn().mockResolvedValue(undefined),
      decompressFile: jest.fn().mockResolvedValue(undefined),
    };
    svc = new PalworldModsService(prisma as any, agent as any);
  });

  it("rejects a server that isn't on the palworld-windows egg", async () => {
    prisma.server.findFirst.mockResolvedValue(
      pwServer({ template: { slug: "palworld" } }),
    );
    await expect(svc.list("srv-1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws NotFound for a missing server", async () => {
    prisma.server.findFirst.mockResolvedValue(null);
    await expect(svc.list("srv-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("reports not-installed when the UE4SS Mods dir is absent", async () => {
    agent.listFiles.mockRejectedValue(new Error("no dir"));
    const v = await svc.list("srv-1");
    expect(v.installed).toBe(false);
    expect(v.mods).toEqual([]);
  });

  it("lists mods with enabled/kind/builtin, skips libs, user mods first", async () => {
    wireFs({
      [MODS]: [
        d("SmartBaseRange"),
        d("BPModLoaderMod"),
        d("shared"),
        d("MyDll"),
        f("mods.txt"),
      ],
      [`${MODS}/SmartBaseRange`]: [d("scripts"), f("enabled.txt")],
      [`${MODS}/BPModLoaderMod`]: [d("scripts")],
      [`${MODS}/MyDll`]: [d("dlls")],
    });
    // mods.txt enables the built-in but explicitly disables SmartBaseRange there
    // (its own enabled.txt still wins → enabled).
    agent.readFile.mockResolvedValue({
      content: "BPModLoaderMod : 1\nSmartBaseRange : 0\n",
    });

    const v = await svc.list("srv-1");
    expect(v.installed).toBe(true);
    const by = Object.fromEntries(v.mods.map((m) => [m.name, m]));
    expect(by.SmartBaseRange).toMatchObject({
      enabled: true,
      builtin: false,
      kind: "lua",
    });
    expect(by.BPModLoaderMod).toMatchObject({
      enabled: true,
      builtin: true,
      kind: "lua",
    });
    expect(by.MyDll).toMatchObject({ enabled: false, kind: "dll" });
    // "shared" is a library, not a mod.
    expect(v.mods.some((m) => m.name === "shared")).toBe(false);
    // user mods before built-ins
    expect(v.mods[0].builtin).toBe(false);
    expect(v.mods[v.mods.length - 1].builtin).toBe(true);
  });

  it("install: rejects unsafe/non-zip names; extracts a valid zip and drops it", async () => {
    wireFs({ [MODS]: [] });
    await expect(svc.install("srv-1", "../evil.zip")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.install("srv-1", "notazip.txt")).rejects.toBeInstanceOf(
      BadRequestException,
    );

    await svc.install("srv-1", "SmartBaseRange.zip");
    expect(agent.decompressFile).toHaveBeenCalledWith(
      NODE,
      "srv-1",
      `${MODS}/SmartBaseRange.zip`,
      MODS,
    );
    // archive removed after extraction
    expect(agent.deleteFiles).toHaveBeenCalledWith(NODE, "srv-1", [
      `${MODS}/SmartBaseRange.zip`,
    ]);
  });

  it("setEnabled: toggles enabled.txt and refuses built-ins", async () => {
    wireFs({ [MODS]: [] });
    await svc.setEnabled("srv-1", "SmartBaseRange", true);
    expect(agent.writeFile).toHaveBeenCalledWith(
      NODE,
      "srv-1",
      `${MODS}/SmartBaseRange/enabled.txt`,
      expect.any(String),
    );
    await svc.setEnabled("srv-1", "SmartBaseRange", false);
    expect(agent.deleteFiles).toHaveBeenCalledWith(NODE, "srv-1", [
      `${MODS}/SmartBaseRange/enabled.txt`,
    ]);
    await expect(
      svc.setEnabled("srv-1", "BPModLoaderMod", false),
    ).rejects.toBeInstanceOf(BadRequestException);
    // The shared-Lua library (and case variants) are protected too.
    await expect(
      svc.setEnabled("srv-1", "shared", true),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("remove: deletes the folder; refuses built-ins and path traversal", async () => {
    wireFs({ [MODS]: [] });
    await svc.remove("srv-1", "SmartBaseRange");
    expect(agent.deleteFiles).toHaveBeenCalledWith(NODE, "srv-1", [
      `${MODS}/SmartBaseRange`,
    ]);
    await expect(svc.remove("srv-1", "BPModLoaderMod")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // The shared library can't be deleted (it isn't a built-in, but it's protected).
    await expect(svc.remove("srv-1", "shared")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.remove("srv-1", "SHARED")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.remove("srv-1", "../../etc")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.remove("srv-1", "bad/name")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
