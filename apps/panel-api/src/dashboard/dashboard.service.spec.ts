import { DashboardService } from "./dashboard.service";
import { SUBSCRIPTION_PUBLIC_SELECT } from "../billing/subscription-public.util";
import {
  NODE_PUBLIC_SELECT,
  SERVER_SECRET_OMIT,
} from "../servers/server-secrets.util";

/**
 * GET /dashboard returns the caller's server rows verbatim, so the query must
 * carry the same response hygiene as ServersService: the secret Server columns
 * (sftpPasswordEnc, steamUsername, steamPasswordEnc, steamGuardCode) omitted at
 * the Prisma layer, and only the public node projection embedded — never the
 * full Node row.
 */
describe("DashboardService summary response hygiene", () => {
  let prisma: any;
  let service: DashboardService;

  beforeEach(() => {
    prisma = {
      server: { findMany: jest.fn().mockResolvedValue([]) },
      subscription: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const alerts: any = { listActiveAlerts: jest.fn().mockResolvedValue([]) };
    service = new DashboardService(prisma, alerts as any);
  });

  it("omits the secret server columns from the servers query", async () => {
    await service.summary("user-1");
    expect(prisma.server.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ omit: SERVER_SECRET_OMIT }),
    );
  });

  it("embeds only the public node projection on server rows", async () => {
    await service.summary("user-1");
    expect(prisma.server.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          node: { select: NODE_PUBLIC_SELECT },
        }),
      }),
    );
  });

  it("returns only the public subscription projection (no gatewaySubId/attribution)", async () => {
    await service.summary("user-1");
    expect(prisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          ...SUBSCRIPTION_PUBLIC_SELECT,
          product: { select: { name: true } },
        },
      }),
    );
  });

  it("flattens primaryAllocation so the web's connection badge can render", async () => {
    const primary = { id: "alloc-2", ip: "n1.refx.gg", port: 25566, isPrimary: true };
    prisma.server.findMany.mockResolvedValue([
      {
        id: "srv-1",
        state: "RUNNING",
        cpuCores: 2,
        memoryMb: 4096,
        diskMb: 20000,
        allocations: [
          { id: "alloc-1", ip: "n1.refx.gg", port: 25565, isPrimary: false },
          primary,
        ],
      },
      {
        id: "srv-2",
        state: "OFFLINE",
        cpuCores: 1,
        memoryMb: 2048,
        diskMb: 10000,
        allocations: [],
      },
    ]);

    const res = await service.summary("user-1");

    expect(prisma.server.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ allocations: true }),
      }),
    );
    // The isPrimary allocation wins; a server with none gets null (badge hidden).
    expect(res.servers[0].primaryAllocation).toEqual(primary);
    expect(res.servers[1].primaryAllocation).toBeNull();
  });
});
