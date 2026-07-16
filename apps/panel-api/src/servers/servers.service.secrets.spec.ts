import { ServersService } from "./servers.service";
import { SERVER_SECRET_OMIT } from "./server-secrets.util";

/**
 * Server rows returned by client-facing routes must have the secret columns
 * (sftpPasswordEnc, steamUsername, steamPasswordEnc, steamGuardCode) stripped
 * at the Prisma layer — the schema documents them as never returned to the
 * client. These tests pin the `omit` on every read/update whose row reaches
 * an API response.
 */
describe("ServersService secret-column omission", () => {
  let prisma: any;
  let service: ServersService;

  const USER = { id: "user-1", permissions: [] } as any;
  const PAGINATION = { page: 1, pageSize: 25, skip: 0, take: 25 } as any;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      server: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: "srv-1", ownerId: "user-1" }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({ id: "srv-1" }),
      },
      subUser: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    service = new ServersService(
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
  });

  it("get() (GET /servers/:id) omits the secret columns", async () => {
    await service.get("srv-1");
    expect(prisma.server.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ omit: SERVER_SECRET_OMIT }),
    );
  });

  it("getForUser() (GraphQL) omits the secret columns", async () => {
    await service.getForUser(USER, "srv-1");
    expect(prisma.server.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ omit: SERVER_SECRET_OMIT }),
    );
  });

  it("list() (GET /servers) omits the secret columns", async () => {
    await service.list(USER, PAGINATION);
    expect(prisma.server.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ omit: SERVER_SECRET_OMIT }),
    );
  });

  it("adminList() omits the secret columns", async () => {
    await service.adminList(PAGINATION);
    expect(prisma.server.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ omit: SERVER_SECRET_OMIT }),
    );
  });

  it("setStartup() (PUT /servers/:id/startup) omits the secret columns", async () => {
    await service.setStartup("srv-1", { startupCommand: "./run" });
    expect(prisma.server.update).toHaveBeenCalledWith(
      expect.objectContaining({ omit: SERVER_SECRET_OMIT }),
    );
  });

  it("covers exactly the columns the schema marks as secret", () => {
    expect(Object.keys(SERVER_SECRET_OMIT).sort()).toEqual([
      "sftpPasswordEnc",
      "steamGuardCode",
      "steamPasswordEnc",
      "steamUsername",
    ]);
  });
});
