import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ServerState } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NodeAgentClient } from "../agent/agent.client";
import {
  applyUpdates,
  buildData,
  MANAGED_KEYS,
  parseOptionSettings,
  PalValidationError,
  replaceOptionSettingsLine,
  serializeOptionSettings,
  type PalworldSettingsData,
} from "./palworld-settings.util";

/** The Linux dedicated-server ini (Palworld's native build on ReFx). */
const INI_PATH = "Pal/Saved/Config/LinuxServer/PalWorldSettings.ini";

/** GET/PATCH response: parsed settings plus the context the web form needs to
 * decide whether it can save (Palworld only reads the ini at boot, so we can
 * only safely write while the server is stopped). */
export interface PalworldSettingsView extends PalworldSettingsData {
  state: ServerState;
  /** True when the server is stopped and the ini can be safely rewritten. */
  editable: boolean;
  /** Keys also written from the Startup tab (rendered read-only in the form). */
  managedKeys: string[];
}

/**
 * Reads and edits Palworld's `PalWorldSettings.ini` (`OptionSettings=(...)`)
 * through a curated typed form, writing atomically via the agent and ONLY while
 * the server is stopped.
 *
 * WHY stopped-only: Palworld reads the ini exactly once at boot and the running
 * process then owns/normalizes the file, so any live edit is ignored and
 * clobbered on the next save — the reported "settings won't stick" bug. Editing
 * while stopped + an atomic whole-file write makes the change actually apply on
 * the next start. Mirrors the world-recovery flow (Minecraft level.dat), which
 * has the same "must be stopped or it gets overwritten" constraint.
 */
@Injectable()
export class PalworldSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: NodeAgentClient,
  ) {}

  private async load(serverId: string) {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      include: { template: true, node: true },
    });
    if (!server) throw new NotFoundException("Server not found");

    if (server.template?.slug !== "palworld") {
      throw new BadRequestException(
        "Palworld settings are only available for Palworld servers.",
      );
    }
    return server;
  }

  /** Read + parse the ini. Missing file is a clear NotFound (the install script
   * seeds it, so it only lacks one before the first install completes). */
  private async readIni(server: {
    node: import("@prisma/client").Node;
    id: string;
  }): Promise<{ content: string; pairs: ReturnType<typeof parseOptionSettings> }> {
    let content = "";
    try {
      const res = await this.agent.readFile(server.node, server.id, INI_PATH);
      content = res.content ?? "";
    } catch {
      throw new NotFoundException(
        "PalWorldSettings.ini not found yet — start or reinstall the server once to generate it.",
      );
    }
    return { content, pairs: parseOptionSettings(content) };
  }

  private view(state: ServerState, data: PalworldSettingsData): PalworldSettingsView {
    return {
      state,
      editable: state === "OFFLINE" || state === "CRASHED",
      managedKeys: MANAGED_KEYS,
      ...data,
    };
  }

  /** Curated typed settings for the form (secrets masked, all other keys kept). */
  async get(serverId: string): Promise<PalworldSettingsView> {
    const server = await this.load(serverId);
    const { pairs } = await this.readIni(server);
    return this.view(server.state, buildData(pairs));
  }

  /**
   * Apply curated field edits to the ini. Rejected with 409 unless the server
   * is stopped (see class doc). Preserves every key not in the payload and every
   * non-curated key, so a partial write can never strand the tuple on defaults.
   */
  async update(
    serverId: string,
    fields: Record<string, unknown> | undefined,
  ): Promise<PalworldSettingsView> {
    const server = await this.load(serverId);

    // Palworld ignores ini changes while running and rewrites the file on save,
    // so a live edit would silently vanish. Require it stopped, exactly like
    // world-recovery does for level.dat.
    if (server.state !== "OFFLINE" && server.state !== "CRASHED") {
      throw new ConflictException(
        "Stop the server before saving Palworld settings, then try again.",
      );
    }

    const { content, pairs } = await this.readIni(server);

    let next = pairs;
    try {
      next = applyUpdates(pairs, fields ?? {});
    } catch (e) {
      if (e instanceof PalValidationError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }

    const newContent = replaceOptionSettingsLine(
      content,
      serializeOptionSettings(next),
    );
    await this.agent.writeFile(server.node, server.id, INI_PATH, newContent);

    return this.view(server.state, buildData(next));
  }
}
