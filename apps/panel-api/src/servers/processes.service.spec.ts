import { ServiceUnavailableException } from "@nestjs/common";
import { ProcessesService } from "./processes.service";

describe("ProcessesService", () => {
  const makeServer = (over: Record<string, unknown> = {}) => ({
    id: "srv-1",
    state: "RUNNING",
    node: { id: "node-1", name: "node-1" },
    ...over,
  });

  let prisma: any;
  let agent: any;
  let svc: ProcessesService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = { server: { findFirst: jest.fn() } };
    agent = { fetchProcesses: jest.fn() };
    svc = new ProcessesService(prisma, agent);
  });

  it("maps the agent's process listing through with supported:true", async () => {
    const server = makeServer();
    prisma.server.findFirst.mockResolvedValue(server);
    agent.fetchProcesses.mockResolvedValue({
      state: "RUNNING",
      processes: [
        {
          pid: 123,
          ppid: 1,
          command: "./arma3server -client -connect=127.0.0.1",
          cpuPercent: 1.2,
          memMb: 512,
          elapsedSec: 3600,
        },
        {
          pid: 7,
          command: "./arma3server -config=server.cfg",
          cpuPercent: 42.5,
          memMb: 2048,
          elapsedSec: 3700,
        },
      ],
    });

    const res = await svc.get("srv-1");
    expect(agent.fetchProcesses).toHaveBeenCalledWith(server.node, "srv-1");
    expect(res).toEqual({
      state: "RUNNING",
      supported: true,
      processes: [
        expect.objectContaining({ pid: 123, ppid: 1 }),
        expect.objectContaining({
          pid: 7,
          command: "./arma3server -config=server.cfg",
        }),
      ],
    });
  });

  it("normalizes a missing process list to an empty array", async () => {
    prisma.server.findFirst.mockResolvedValue(makeServer());
    agent.fetchProcesses.mockResolvedValue({ state: "STOPPED" });
    await expect(svc.get("srv-1")).resolves.toEqual({
      state: "STOPPED",
      supported: true,
      processes: [],
    });
  });

  it("degrades to supported:false when the backend cannot enumerate (agent 501)", async () => {
    prisma.server.findFirst.mockResolvedValue(makeServer({ state: "RUNNING" }));
    agent.fetchProcesses.mockRejectedValue(
      new ServiceUnavailableException(
        "Node agent error 501: process listing not supported on this runtime",
      ),
    );
    await expect(svc.get("srv-1")).resolves.toEqual({
      state: "RUNNING",
      supported: false,
      processes: [],
    });
  });

  it("degrades to supported:false when the agent predates the route (agent 404)", async () => {
    prisma.server.findFirst.mockResolvedValue(makeServer({ state: "RUNNING" }));
    agent.fetchProcesses.mockRejectedValue(
      new ServiceUnavailableException("Node agent error 404: not found"),
    );
    await expect(svc.get("srv-1")).resolves.toEqual({
      state: "RUNNING",
      supported: false,
      processes: [],
    });
  });

  it("propagates other agent HTTP errors", async () => {
    prisma.server.findFirst.mockResolvedValue(makeServer());
    agent.fetchProcesses.mockRejectedValue(
      new ServiceUnavailableException("Node agent error 409: not running"),
    );
    await expect(svc.get("srv-1")).rejects.toThrow(
      "Node agent error 409: not running",
    );
  });

  it("propagates unreachable-node errors", async () => {
    prisma.server.findFirst.mockResolvedValue(makeServer());
    agent.fetchProcesses.mockRejectedValue(
      new ServiceUnavailableException("Node node-1 unreachable: timeout"),
    );
    await expect(svc.get("srv-1")).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it("404s for unknown servers", async () => {
    prisma.server.findFirst.mockResolvedValue(null);
    await expect(svc.get("nope")).rejects.toThrow("Server not found");
    expect(agent.fetchProcesses).not.toHaveBeenCalled();
  });
});
