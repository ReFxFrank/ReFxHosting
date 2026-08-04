import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AgentProcessInfo, NodeAgentClient } from "../agent/agent.client";

/**
 * Live process listing for a server, straight from the node-agent. A single
 * game server legitimately runs several processes (an Arma 3 server plus its
 * paid headless clients share one container) and only the command lines tell
 * them apart — this is how the panel shows what is actually running.
 *
 * Backends that cannot enumerate (Windows containers) answer 501; that maps to
 * `supported: false` so the UI degrades instead of erroring.
 */

export interface ProcessesResult {
  state: string;
  supported: boolean;
  processes: AgentProcessInfo[];
}

@Injectable()
export class ProcessesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: NodeAgentClient,
  ) {}

  async get(serverId: string): Promise<ProcessesResult> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      include: { node: true },
    });
    if (!server) throw new NotFoundException("Server not found");

    try {
      const res = await this.agent.fetchProcesses(server.node, serverId);
      return {
        state: res.state,
        supported: true,
        processes: res.processes ?? [],
      };
    } catch (err) {
      // The agent client rethrows every non-2xx as a ServiceUnavailableException
      // whose message embeds the agent's status ("Node agent error 501: ...").
      // 501 = the runtime backend can't enumerate processes; 404 = the agent
      // predates the /processes route (nodes update after the panel). Both
      // degrade rather than error — the web polls this every 10s and would
      // otherwise spam failing requests for the whole rollout window.
      if (
        err instanceof ServiceUnavailableException &&
        /^Node agent error (404|501)\b/.test(err.message)
      ) {
        return {
          state: server.state ?? "UNKNOWN",
          supported: false,
          processes: [],
        };
      }
      throw err;
    }
  }
}
