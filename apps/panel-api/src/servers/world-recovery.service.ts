import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NodeAgentClient } from "../agent/agent.client";

/** Result of a level.dat recovery attempt. */
export interface LevelDatRestoreResult {
  world: string;
  restored: boolean;
  /** Where the (corrupt) prior level.dat was moved, if one existed. */
  preservedAs: string | null;
  /** Size in bytes of the level.dat_old that was promoted. */
  restoredBytes: number | null;
}

/** State of the level.dat / level.dat_old pair, for the pre-flight the UI shows. */
export interface LevelDatStatus {
  world: string;
  /** level.dat exists in the world folder. */
  hasLevelDat: boolean;
  levelDatBytes: number | null;
  /** A previous-save backup (level.dat_old) exists to restore from. */
  hasBackup: boolean;
  backupBytes: number | null;
  /** True if the current level.dat looks corrupt (missing or ~empty). */
  looksCorrupt: boolean;
  /** True if a restore is possible (a plausibly-valid backup exists). */
  restorable: boolean;
}

/** A level.dat smaller than this is treated as empty/corrupt — a healthy modded
 * level.dat is comfortably into the kilobytes. */
const MIN_VALID_LEVEL_DAT_BYTES = 100;

/**
 * One-click recovery for the classic corrupt-`level.dat` crash on Minecraft
 * servers ("No key dimensions/seed in MapLike[{}]" → "Failed to load
 * datapacks"). Minecraft writes the previous good copy as `level.dat_old`;
 * this promotes it back to `level.dat`, preserving the corrupt file. Implemented
 * purely by orchestrating the agent's existing jailed file operations — no
 * node-agent change required.
 */
@Injectable()
export class WorldRecoveryService {
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

    const slug = server.template?.slug ?? "";
    const isMinecraft = slug === "minecraft" || slug.startsWith("minecraft-");
    if (!isMinecraft) {
      throw new BadRequestException(
        "level.dat recovery is only available for Minecraft servers.",
      );
    }
    return server;
  }

  /** Resolve the world directory from server.properties `level-name`
   * (default "world"). Reading is best-effort — any failure falls back. */
  private async resolveWorldFolder(server: {
    node: import("@prisma/client").Node;
    id: string;
  }): Promise<string> {
    try {
      const { content } = await this.agent.readFile(
        server.node,
        server.id,
        "server.properties",
      );
      const match = content.match(/^\s*level-name\s*=\s*(.+?)\s*$/m);
      const name = match?.[1]?.trim();
      // Guard against a path-y or empty level-name; keep it a single segment.
      if (name && !name.includes("/") && !name.includes("..")) return name;
    } catch {
      /* fall through to the default */
    }
    return "world";
  }

  /** Inspect the level.dat / level.dat_old pair so the UI can explain the
   * situation before the customer commits to a restore. */
  async status(serverId: string): Promise<LevelDatStatus> {
    const server = await this.load(serverId);
    const world = await this.resolveWorldFolder(server);

    let entries;
    try {
      entries = await this.agent.listFiles(server.node, server.id, world);
    } catch {
      throw new NotFoundException(
        `World folder "${world}" not found on disk yet — start the server once to generate it, or restore a backup.`,
      );
    }

    const current = entries.find((e) => e.name === "level.dat" && !e.isDir);
    const backup = entries.find((e) => e.name === "level.dat_old" && !e.isDir);
    const hasLevelDat = !!current;
    const levelDatBytes = current?.size ?? null;
    const hasBackup = !!backup;
    const backupBytes = backup?.size ?? null;
    const looksCorrupt =
      !hasLevelDat || (levelDatBytes ?? 0) < MIN_VALID_LEVEL_DAT_BYTES;
    const restorable =
      hasBackup && (backupBytes ?? 0) >= MIN_VALID_LEVEL_DAT_BYTES;

    return {
      world,
      hasLevelDat,
      levelDatBytes,
      hasBackup,
      backupBytes,
      looksCorrupt,
      restorable,
    };
  }

  /**
   * Promote `level.dat_old` to `level.dat`, preserving the current (corrupt)
   * file as `level.dat.corrupt-<timestamp>`. The server must be stopped so the
   * restored file isn't clobbered by the next world save.
   */
  async restoreLevelDat(serverId: string): Promise<LevelDatRestoreResult> {
    const server = await this.load(serverId);

    // A running server rewrites level.dat on save; require it stopped so the
    // recovery actually sticks.
    if (server.state !== "OFFLINE" && server.state !== "CRASHED") {
      throw new ConflictException(
        "Stop the server before restoring level.dat, then try again.",
      );
    }

    const world = await this.resolveWorldFolder(server);

    let entries;
    try {
      entries = await this.agent.listFiles(server.node, server.id, world);
    } catch {
      throw new NotFoundException(`World folder "${world}" not found.`);
    }

    const current = entries.find((e) => e.name === "level.dat" && !e.isDir);
    const backup = entries.find((e) => e.name === "level.dat_old" && !e.isDir);

    if (!backup) {
      throw new BadRequestException(
        "No previous copy (level.dat_old) was found to restore from. Restore from a backup instead.",
      );
    }
    if ((backup.size ?? 0) < MIN_VALID_LEVEL_DAT_BYTES) {
      throw new BadRequestException(
        "The previous copy (level.dat_old) is also empty or corrupt. Restore from a backup instead.",
      );
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const preservedAs = current ? `level.dat.corrupt-${stamp}` : null;

    // Preserve the corrupt file (if any) rather than destroying evidence, then
    // promote the good copy.
    if (current && preservedAs) {
      await this.agent.renameFile(
        server.node,
        server.id,
        `${world}/level.dat`,
        `${world}/${preservedAs}`,
      );
    }
    await this.agent.renameFile(
      server.node,
      server.id,
      `${world}/level.dat_old`,
      `${world}/level.dat`,
    );

    return {
      world,
      restored: true,
      preservedAs,
      restoredBytes: backup.size ?? null,
    };
  }
}
