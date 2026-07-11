import { ServersService } from "./servers.service";

/**
 * Crash auto-restart toggle: persists REFX_AUTO_RESTART on the server's
 * environment (the agent reads it from the spec; absence means ON) and pushes
 * a spec reload so the running agent picks it up without a reinstall.
 */
describe("ServersService auto-restart", () => {
  const node = { id: "node-1", fqdn: "1.2.3.4" };
  let prisma: any;
  let nodes: any;
  let agent: any;
  let service: ServersService;

  const makeService = () =>
    new ServersService(
      prisma,
      {} as any,
      nodes as any,
      agent as any,
      {} as any,
      {} as any,
      { add: jest.fn() } as any,
      { add: jest.fn() } as any,
      { add: jest.fn() } as any,
    );

  beforeEach(() => {
    prisma = {
      server: {
        findFirst: jest.fn().mockResolvedValue({
          id: "srv-1",
          nodeId: "node-1",
          environment: { LOADER: "fabric" },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      node: { findUnique: jest.fn().mockResolvedValue(node) },
    };
    nodes = {
      buildServerInstallSpec: jest
        .fn()
        .mockResolvedValue({ serverId: "srv-1" }),
    };
    agent = { reloadServer: jest.fn().mockResolvedValue(undefined) };
    service = makeService();
  });

  it("disabling writes REFX_AUTO_RESTART=false, keeping other env keys", async () => {
    const res = await service.setAutoRestart("srv-1", false);
    expect(res).toEqual({ enabled: false });
    expect(prisma.server.update).toHaveBeenCalledWith({
      where: { id: "srv-1" },
      data: {
        environment: { LOADER: "fabric", REFX_AUTO_RESTART: "false" },
      },
    });
    expect(agent.reloadServer).toHaveBeenCalled();
  });

  it("enabling writes REFX_AUTO_RESTART=true", async () => {
    const res = await service.setAutoRestart("srv-1", true);
    expect(res).toEqual({ enabled: true });
    expect(prisma.server.update).toHaveBeenCalledWith({
      where: { id: "srv-1" },
      data: {
        environment: { LOADER: "fabric", REFX_AUTO_RESTART: "true" },
      },
    });
  });

  it("handles a server with no stored environment", async () => {
    prisma.server.findFirst.mockResolvedValue({
      id: "srv-1",
      nodeId: "node-1",
      environment: null,
    });
    await service.setAutoRestart("srv-1", false);
    expect(prisma.server.update).toHaveBeenCalledWith({
      where: { id: "srv-1" },
      data: { environment: { REFX_AUTO_RESTART: "false" } },
    });
  });

  it("404s for an unknown server", async () => {
    prisma.server.findFirst.mockResolvedValue(null);
    await expect(service.setAutoRestart("nope", true)).rejects.toThrow(
      "Server not found",
    );
    expect(prisma.server.update).not.toHaveBeenCalled();
  });

  it("still succeeds when the spec push fails (best-effort)", async () => {
    agent.reloadServer.mockRejectedValue(new Error("agent offline"));
    const res = await service.setAutoRestart("srv-1", false);
    expect(res).toEqual({ enabled: false });
  });
});
