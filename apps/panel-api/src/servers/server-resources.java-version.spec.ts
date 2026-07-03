import { BadRequestException } from "@nestjs/common";
import { ServerResourcesService } from "./server-resources.service";

/**
 * Java selector: reads the effective JVM major (override or auto-from-version)
 * and pins/clears a JAVA_VERSION override the install-spec builder honors.
 */
describe("ServerResourcesService java version", () => {
  let prisma: any;
  let svc: ServerResourcesService;

  const javaServer = (over: Record<string, unknown> = {}) => ({
    id: "srv-1",
    dockerImage: "eclipse-temurin:21-jre",
    environment: {},
    variables: [],
    template: { variables: [{ defaultValue: "1.21.1" }] },
    ...over,
  });

  beforeEach(() => {
    prisma = {
      server: { findFirst: jest.fn() },
      serverVariable: {
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    svc = new ServerResourcesService(prisma);
  });

  it("reports auto when no override is set", async () => {
    prisma.server.findFirst.mockResolvedValue(javaServer());
    const res = await svc.getJavaVersion("srv-1");
    expect(res).toMatchObject({ selected: "auto", auto: 21, effective: 21 });
    expect(res.options).toEqual(expect.arrayContaining([8, 11, 17, 21, 25]));
  });

  it("reports a pinned override as the effective major", async () => {
    prisma.server.findFirst.mockResolvedValue(
      javaServer({ variables: [{ envName: "JAVA_VERSION", value: "8" }] }),
    );
    const res = await svc.getJavaVersion("srv-1");
    expect(res).toMatchObject({ selected: "8", effective: 8, auto: 21 });
  });

  it("pins a supported major via an override row", async () => {
    prisma.server.findFirst.mockResolvedValue(javaServer());
    await svc.setJavaVersion("srv-1", "17");
    expect(prisma.serverVariable.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          envName: "JAVA_VERSION",
          value: "17",
        }),
        update: { value: "17" },
      }),
    );
  });

  it('clears the override on "auto"', async () => {
    prisma.server.findFirst.mockResolvedValue(javaServer());
    await svc.setJavaVersion("srv-1", "auto");
    expect(prisma.serverVariable.deleteMany).toHaveBeenCalledWith({
      where: { serverId: "srv-1", envName: "JAVA_VERSION" },
    });
    expect(prisma.serverVariable.upsert).not.toHaveBeenCalled();
  });

  it("rejects an unsupported major", async () => {
    prisma.server.findFirst.mockResolvedValue(javaServer());
    await expect(svc.setJavaVersion("srv-1", "19")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.serverVariable.upsert).not.toHaveBeenCalled();
  });

  it("refuses non-Java servers", async () => {
    prisma.server.findFirst.mockResolvedValue(
      javaServer({ dockerImage: "ghcr.io/refx/rust:latest" }),
    );
    await expect(svc.getJavaVersion("srv-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
