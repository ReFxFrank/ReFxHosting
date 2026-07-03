import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { WorldRecoveryService } from "./world-recovery.service";

/**
 * Unit tests for level.dat recovery. Prisma + the node agent are mocked; the
 * service holds the recovery logic (Minecraft-only, must be stopped, needs a
 * valid level.dat_old, preserves the corrupt file, promotes the backup).
 */
describe("WorldRecoveryService", () => {
  const NODE = { id: "node-1" };
  let prisma: { server: { findFirst: jest.Mock } };
  let agent: {
    readFile: jest.Mock;
    listFiles: jest.Mock;
    renameFile: jest.Mock;
  };
  let svc: WorldRecoveryService;

  const mcServer = (over: Record<string, unknown> = {}) => ({
    id: "srv-1",
    state: "OFFLINE",
    node: NODE,
    template: { slug: "minecraft" },
    ...over,
  });

  beforeEach(() => {
    prisma = { server: { findFirst: jest.fn() } };
    agent = {
      readFile: jest.fn().mockResolvedValue({ content: "" }),
      listFiles: jest.fn(),
      renameFile: jest.fn().mockResolvedValue(undefined),
    };
    svc = new WorldRecoveryService(prisma as any, agent as any);
  });

  it("rejects a non-Minecraft server", async () => {
    prisma.server.findFirst.mockResolvedValue(
      mcServer({ template: { slug: "rust" } }),
    );
    await expect(svc.restoreLevelDat("srv-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("refuses to restore while the server is running", async () => {
    prisma.server.findFirst.mockResolvedValue(mcServer({ state: "RUNNING" }));
    await expect(svc.restoreLevelDat("srv-1")).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(agent.renameFile).not.toHaveBeenCalled();
  });

  it("refuses when there is no level.dat_old to restore from", async () => {
    prisma.server.findFirst.mockResolvedValue(mcServer());
    agent.listFiles.mockResolvedValue([
      { name: "level.dat", isDir: false, size: 0 },
    ]);
    await expect(svc.restoreLevelDat("srv-1")).rejects.toThrow(
      /no previous copy/i,
    );
    expect(agent.renameFile).not.toHaveBeenCalled();
  });

  it("refuses when level.dat_old is itself empty/corrupt", async () => {
    prisma.server.findFirst.mockResolvedValue(mcServer());
    agent.listFiles.mockResolvedValue([
      { name: "level.dat", isDir: false, size: 0 },
      { name: "level.dat_old", isDir: false, size: 4 },
    ]);
    await expect(svc.restoreLevelDat("srv-1")).rejects.toThrow(
      /empty or corrupt/i,
    );
  });

  it("preserves the corrupt file and promotes the backup on the happy path", async () => {
    prisma.server.findFirst.mockResolvedValue(mcServer());
    agent.listFiles.mockResolvedValue([
      { name: "level.dat", isDir: false, size: 0 },
      { name: "level.dat_old", isDir: false, size: 40_000 },
    ]);
    const res = await svc.restoreLevelDat("srv-1");

    expect(res.restored).toBe(true);
    expect(res.preservedAs).toMatch(/^level\.dat\.corrupt-/);
    expect(res.restoredBytes).toBe(40_000);
    // corrupt level.dat preserved first, then backup promoted.
    expect(agent.renameFile).toHaveBeenNthCalledWith(
      1,
      NODE,
      "srv-1",
      "world/level.dat",
      expect.stringMatching(/^world\/level\.dat\.corrupt-/),
    );
    expect(agent.renameFile).toHaveBeenNthCalledWith(
      2,
      NODE,
      "srv-1",
      "world/level.dat_old",
      "world/level.dat",
    );
  });

  it("uses the level-name from server.properties as the world folder", async () => {
    prisma.server.findFirst.mockResolvedValue(mcServer());
    agent.readFile.mockResolvedValue({ content: "level-name=SkyBlock\n" });
    agent.listFiles.mockResolvedValue([
      { name: "level.dat", isDir: false, size: 10 },
      { name: "level.dat_old", isDir: false, size: 40_000 },
    ]);
    const res = await svc.restoreLevelDat("srv-1");
    expect(res.world).toBe("SkyBlock");
    expect(agent.listFiles).toHaveBeenCalledWith(NODE, "srv-1", "SkyBlock");
  });

  it("status flags a corrupt current file with a valid backup as restorable", async () => {
    prisma.server.findFirst.mockResolvedValue(mcServer());
    agent.listFiles.mockResolvedValue([
      { name: "level.dat", isDir: false, size: 0 },
      { name: "level.dat_old", isDir: false, size: 40_000 },
    ]);
    const s = await svc.status("srv-1");
    expect(s.looksCorrupt).toBe(true);
    expect(s.restorable).toBe(true);
    expect(s.world).toBe("world");
  });

  it("status throws NotFound when the world folder is absent", async () => {
    prisma.server.findFirst.mockResolvedValue(mcServer());
    agent.listFiles.mockRejectedValue(new Error("no such dir"));
    await expect(svc.status("srv-1")).rejects.toBeInstanceOf(NotFoundException);
  });
});
