import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NodeAgentClient } from "../agent/agent.client";

/** A UE4SS mod folder under ue4ss/Mods. */
export interface PalworldMod {
  name: string;
  /** enabled.txt present (or listed enabled in mods.txt). */
  enabled: boolean;
  /** A UE4SS built-in (ships with the loader) — shown read-only. */
  builtin: boolean;
  /** Loader kind inferred from the folder contents. */
  kind: "lua" | "dll" | "blueprint" | "other";
}

export interface PalworldModsView {
  /** Data-relative path of the UE4SS mods directory. */
  modsDir: string;
  /** False when UE4SS isn't installed yet (dir missing) — reinstall to set up. */
  installed: boolean;
  mods: PalworldMod[];
}

/** UE4SS mods dir on the Windows/Proton Palworld egg (relative to the data dir). */
const MODS_DIR = "Pal/Binaries/Win64/ue4ss/Mods";

/** Mods that ship with UE4SS — never deletable/toggleable through the panel
 * (removing e.g. BPModLoaderMod would break blueprint mods). */
const BUILTINS = new Set([
  "BPModLoaderMod",
  "BPML_GenericFunctions",
  "ConsoleCommandsMod",
  "ConsoleEnablerMod",
  "LineTraceMod",
  "SplitScreenMod",
  "jsbLuaProfilerMod",
  "Keybinds",
]);

/** Directory entries under Mods that are libraries, not mods. */
const NON_MODS = new Set(["shared"]);

/** Names that must never be toggled/removed through the panel — UE4SS built-ins
 * and shared libraries (removing them breaks the loader / blueprint mods).
 * Compared case-insensitively for defense-in-depth. */
const PROTECTED = new Set(
  [...BUILTINS, ...NON_MODS].map((s) => s.toLowerCase()),
);

/**
 * Manage UE4SS mods on a Windows/Proton Palworld server (the `palworld-windows`
 * egg) from the panel instead of SFTP: list installed mods, install one from an
 * uploaded .zip, enable/disable it, and delete it. All operations go through the
 * agent's jailed file manager (list/write/delete/extract) — no node-agent change.
 *
 * Enabling toggles an `enabled.txt` inside the mod folder (UE4SS honours it), NOT
 * `mods.txt`: a reinstall re-fetches UE4SS and overwrites `mods.txt`, but leaves
 * the mod folder + its enabled.txt intact, so the toggle survives updates.
 */
@Injectable()
export class PalworldModsService {
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
    if (server.template?.slug !== "palworld-windows") {
      throw new BadRequestException(
        "Mod management is only available on the Palworld (Windows/UE4SS) egg.",
      );
    }
    return server;
  }

  /** A safe single mod-folder name — no separators, no traversal, no dotfiles. */
  private safeName(name: string): string {
    const n = (name ?? "").trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9 _.\-]*$/.test(n) || n.includes("..")) {
      throw new BadRequestException("Invalid mod name.");
    }
    return n;
  }

  private isEnabledInModsTxt(modsTxt: string, name: string): boolean {
    // Lines look like "ModName : 1" (enabled) / "ModName : 0" (disabled).
    const re = new RegExp(
      `^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*1\\s*$`,
      "m",
    );
    return re.test(modsTxt);
  }

  async list(serverId: string): Promise<PalworldModsView> {
    const server = await this.load(serverId);

    let entries;
    try {
      entries = await this.agent.listFiles(server.node, server.id, MODS_DIR);
    } catch {
      // Dir missing == UE4SS not bootstrapped yet (server never installed).
      return { modsDir: MODS_DIR, installed: false, mods: [] };
    }

    let modsTxt = "";
    try {
      modsTxt = (
        await this.agent.readFile(server.node, server.id, `${MODS_DIR}/mods.txt`)
      ).content;
    } catch {
      /* no mods.txt — treat as none enabled there */
    }

    const dirs = entries.filter(
      (e) => e.isDir && !NON_MODS.has(e.name.toLowerCase()),
    );
    const mods: PalworldMod[] = [];
    for (const d of dirs) {
      let inner: Awaited<ReturnType<NodeAgentClient["listFiles"]>> = [];
      try {
        inner = await this.agent.listFiles(
          server.node,
          server.id,
          `${MODS_DIR}/${d.name}`,
        );
      } catch {
        /* unreadable — still list the mod, best-effort */
      }
      const has = (n: string, dir: boolean) =>
        inner.some(
          (f) => f.name.toLowerCase() === n && (dir ? f.isDir : !f.isDir),
        );
      const kind: PalworldMod["kind"] = has("dlls", true)
        ? "dll"
        : has("scripts", true)
          ? "lua"
          : "other";
      const enabled =
        has("enabled.txt", false) || this.isEnabledInModsTxt(modsTxt, d.name);
      mods.push({
        name: d.name,
        enabled,
        builtin: BUILTINS.has(d.name),
        kind,
      });
    }
    // User mods first, then built-ins; each group alphabetical.
    mods.sort(
      (a, b) =>
        Number(a.builtin) - Number(b.builtin) ||
        a.name.localeCompare(b.name),
    );
    return { modsDir: MODS_DIR, installed: true, mods };
  }

  /**
   * Install a mod from a .zip the caller already uploaded into MODS_DIR (via the
   * files upload endpoint). Extract it in place so a well-packaged mod lands as
   * `Mods/<ModName>/…`, then remove the archive.
   */
  async install(serverId: string, archive: string): Promise<PalworldModsView> {
    const server = await this.load(serverId);
    const name = (archive ?? "").trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9 _.\-]*\.zip$/i.test(name) || name.includes("..")) {
      throw new BadRequestException(
        "Upload a .zip containing the mod's folder.",
      );
    }
    const src = `${MODS_DIR}/${name}`;
    try {
      await this.agent.decompressFile(server.node, server.id, src, MODS_DIR);
    } catch {
      throw new BadRequestException(
        "Couldn't extract that archive — make sure it's a valid .zip containing the mod's folder.",
      );
    } finally {
      // Always drop the uploaded archive, success or not (best-effort).
      await this.agent
        .deleteFiles(server.node, server.id, [src])
        .catch(() => undefined);
    }
    return this.list(serverId);
  }

  async setEnabled(
    serverId: string,
    name: string,
    enabled: boolean,
  ): Promise<PalworldModsView> {
    const server = await this.load(serverId);
    const safe = this.safeName(name);
    if (PROTECTED.has(safe.toLowerCase())) {
      throw new BadRequestException(
        "Built-in UE4SS mods and shared libraries can't be toggled here.",
      );
    }
    const enabledTxt = `${MODS_DIR}/${safe}/enabled.txt`;
    if (enabled) {
      // Content is irrelevant to UE4SS — presence is what enables the mod.
      await this.agent.writeFile(
        server.node,
        server.id,
        enabledTxt,
        "1\n",
      );
    } else {
      await this.agent
        .deleteFiles(server.node, server.id, [enabledTxt])
        .catch(() => undefined); // already-absent == already disabled
    }
    return this.list(serverId);
  }

  async remove(serverId: string, name: string): Promise<PalworldModsView> {
    const server = await this.load(serverId);
    const safe = this.safeName(name);
    if (PROTECTED.has(safe.toLowerCase())) {
      throw new BadRequestException(
        "Built-in UE4SS mods and shared libraries can't be removed (they're part of the loader).",
      );
    }
    await this.agent.deleteFiles(server.node, server.id, [
      `${MODS_DIR}/${safe}`,
    ]);
    return this.list(serverId);
  }
}
