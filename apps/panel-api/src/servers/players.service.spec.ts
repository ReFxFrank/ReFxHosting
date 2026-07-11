import { PlayersService } from "./players.service";
import { pingMinecraft } from "./minecraft-ping.util";

jest.mock("./minecraft-ping.util", () => ({
  pingMinecraft: jest.fn(),
}));
const mockPing = pingMinecraft as jest.Mock;

describe("PlayersService", () => {
  const makeServer = (over: Record<string, unknown> = {}) => ({
    state: "RUNNING",
    environment: { MINECRAFT_VERSION: "1.21.1" },
    template: { slug: "minecraft" },
    allocations: [
      { ip: "1.2.3.4", port: 25566, isPrimary: false },
      { ip: "1.2.3.4", port: 25565, isPrimary: true },
    ],
    node: { fqdn: "node.example.com" },
    ...over,
  });

  let prisma: any;
  let svc: PlayersService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = { server: { findFirst: jest.fn() } };
    svc = new PlayersService(prisma);
  });

  it("pings the PRIMARY allocation and returns the live status", async () => {
    prisma.server.findFirst.mockResolvedValue(makeServer());
    mockPing.mockResolvedValue({
      online: 2,
      max: 20,
      names: ["Alice", "Bob"],
      version: "Paper 1.21.1",
      latencyMs: 12,
    });
    const res = await svc.get("srv-1");
    expect(mockPing).toHaveBeenCalledWith("1.2.3.4", 25565, expect.any(Number));
    expect(res).toMatchObject({
      supported: true,
      online: true,
      players: { online: 2, max: 20, names: ["Alice", "Bob"] },
    });
  });

  it("reports unsupported for non-Minecraft templates without pinging", async () => {
    prisma.server.findFirst.mockResolvedValue(
      makeServer({ template: { slug: "valheim" }, environment: {} }),
    );
    const res = await svc.get("srv-1");
    expect(res).toEqual({ supported: false, online: false });
    expect(mockPing).not.toHaveBeenCalled();
  });

  it("skips the ping when the server is not RUNNING", async () => {
    prisma.server.findFirst.mockResolvedValue(makeServer({ state: "OFFLINE" }));
    const res = await svc.get("srv-1");
    expect(res).toEqual({ supported: true, online: false });
    expect(mockPing).not.toHaveBeenCalled();
  });

  it("degrades to online:false when the ping fails", async () => {
    prisma.server.findFirst.mockResolvedValue(makeServer());
    mockPing.mockRejectedValue(new Error("timeout"));
    const res = await svc.get("srv-1");
    expect(res).toEqual({ supported: true, online: false });
  });

  it("serves the cache instead of re-pinging within the window", async () => {
    prisma.server.findFirst.mockResolvedValue(makeServer());
    mockPing.mockResolvedValue({
      online: 1,
      max: 20,
      names: [],
      version: null,
      latencyMs: 5,
    });
    await svc.get("srv-1");
    await svc.get("srv-1");
    expect(mockPing).toHaveBeenCalledTimes(1);
    expect(prisma.server.findFirst).toHaveBeenCalledTimes(1);
  });

  it("404s for unknown servers", async () => {
    prisma.server.findFirst.mockResolvedValue(null);
    await expect(svc.get("nope")).rejects.toThrow("Server not found");
  });
});
