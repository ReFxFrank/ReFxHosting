import { ServersService } from "./servers.service";
import { SERVER_SECRET_OMIT } from "./server-secrets.util";

/**
 * Settings → General rename: PATCH /servers/:id updates name/description.
 * Cosmetic only — no agent interaction, no spec reload.
 */
describe("ServersService updateDetails", () => {
  let prisma: any;
  let service: ServersService;

  const makeService = () =>
    new ServersService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { add: jest.fn() } as any,
      { add: jest.fn() } as any,
      { add: jest.fn() } as any,
    );

  beforeEach(() => {
    prisma = {
      server: {
        findFirst: jest.fn().mockResolvedValue({ id: "srv-1" }),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: "srv-1", ...data }),
        ),
      },
    };
    service = makeService();
  });

  it("updates name and description, trimming whitespace", async () => {
    await service.updateDetails("srv-1", {
      name: "  My Server  ",
      description: "  fun times  ",
    });
    expect(prisma.server.update).toHaveBeenCalledWith({
      where: { id: "srv-1" },
      data: { name: "My Server", description: "fun times" },
      omit: SERVER_SECRET_OMIT,
    });
  });

  it("clears the description when an empty string is sent", async () => {
    await service.updateDetails("srv-1", { name: "Kept", description: "" });
    expect(prisma.server.update).toHaveBeenCalledWith({
      where: { id: "srv-1" },
      data: { name: "Kept", description: null },
      omit: SERVER_SECRET_OMIT,
    });
  });

  it("clears the description when JSON null is sent (no crash)", async () => {
    await service.updateDetails("srv-1", {
      name: "Kept",
      description: null,
    });
    expect(prisma.server.update).toHaveBeenCalledWith({
      where: { id: "srv-1" },
      data: { name: "Kept", description: null },
      omit: SERVER_SECRET_OMIT,
    });
  });

  it("leaves omitted fields untouched (PATCH semantics)", async () => {
    await service.updateDetails("srv-1", { name: "Only Name" });
    expect(prisma.server.update).toHaveBeenCalledWith({
      where: { id: "srv-1" },
      data: { name: "Only Name" },
      omit: SERVER_SECRET_OMIT,
    });
  });

  it("rejects a blank name", async () => {
    await expect(
      service.updateDetails("srv-1", { name: "   " }),
    ).rejects.toThrow("Server name cannot be empty");
    expect(prisma.server.update).not.toHaveBeenCalled();
  });

  it("404s for an unknown or deleted server", async () => {
    prisma.server.findFirst.mockResolvedValue(null);
    await expect(
      service.updateDetails("nope", { name: "X" }),
    ).rejects.toThrow("Server not found");
    expect(prisma.server.update).not.toHaveBeenCalled();
  });
});
