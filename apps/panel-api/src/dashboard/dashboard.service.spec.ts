import { DashboardService } from "./dashboard.service";
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
});
