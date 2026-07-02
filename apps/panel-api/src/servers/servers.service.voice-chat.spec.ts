import { ServersService } from "./servers.service";

/**
 * Admin-granted Simple Voice Chat dedicated port: reserves a free UDP port on
 * the server's node (labelled "voicechat"), is idempotent, and pushes the spec
 * to the agent so the port publishes on next restart.
 */
describe("ServersService voice chat", () => {
  const node = {
    id: "node-1",
    fqdn: "1.2.3.4",
    allocationPortStart: 25565,
    allocationPortEnd: 25999,
  };
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
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: "srv-1", nodeId: "node-1", node }),
      },
      allocation: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{ port: 25565 }]),
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
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

  it("reserves a free labelled port and pushes a spec reload", async () => {
    const res = await service.enableVoiceChat("srv-1");
    expect(res.alreadyEnabled).toBe(false);
    expect(res.ip).toBe("1.2.3.4");
    expect(res.port).toBeGreaterThanOrEqual(25565);
    // Created a NON-primary allocation labelled voicechat.
    expect(prisma.allocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          serverId: "srv-1",
          isPrimary: false,
          label: "voicechat",
        }),
      }),
    );
    // Pushed the updated spec to the agent (publishes on next restart).
    expect(agent.reloadServer).toHaveBeenCalled();
  });

  it("is idempotent — returns the existing port without allocating again", async () => {
    prisma.allocation.findFirst.mockResolvedValue({
      port: 25570,
      ip: "1.2.3.4",
    });
    const res = await service.enableVoiceChat("srv-1");
    expect(res).toMatchObject({ port: 25570, alreadyEnabled: true });
    expect(prisma.allocation.create).not.toHaveBeenCalled();
  });

  it("disable removes the voicechat allocation and reloads", async () => {
    const res = await service.disableVoiceChat("srv-1");
    expect(res.disabled).toBe(true);
    expect(prisma.allocation.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { serverId: "srv-1", label: "voicechat" },
      }),
    );
    expect(agent.reloadServer).toHaveBeenCalled();
  });

  it("status reflects a present voicechat allocation", async () => {
    prisma.allocation.findFirst.mockResolvedValue({
      port: 25570,
      ip: "1.2.3.4",
    });
    await expect(service.voiceChatStatus("srv-1")).resolves.toEqual({
      enabled: true,
      port: 25570,
      ip: "1.2.3.4",
    });
  });
});
