import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { uuidv7 } from "../common/util/uuid";
import { isValidCron, nextCronRun } from "./cron.util";

/**
 * Whitelist persisted schedule-task options: only the BACKUP mode survives
 * (arbitrary client JSON must not land in the DB). Undefined = column stays
 * NULL and the runner applies its default (ESSENTIALS).
 */
function taskOptions(t: {
  action: string;
  options?: { mode?: string };
}): Prisma.InputJsonValue | undefined {
  const mode = t.options?.mode;
  if (t.action === "BACKUP" && (mode === "ESSENTIALS" || mode === "FULL")) {
    return { mode };
  }
  return undefined;
}
import { jvmHeapMb, SERVER_MEMORY_VAR } from "./server-memory.util";
import {
  isJavaImage,
  JAVA_VERSION_VAR,
  parseJavaOverride,
  requiredJavaMajor,
  SUPPORTED_JAVA_MAJORS,
} from "../common/util/java-version.util";
import {
  AddSubUserDto,
  CreateAllocationDto,
  CreateScheduleDto,
  UpdateScheduleDto,
} from "./dto/server.dto";

/**
 * Sub-resource operations scoped to a single server: variables, allocations,
 * sub-users, and schedules. Authorization is enforced upstream by
 * PermissionGuard on the controller.
 */
@Injectable()
export class ServerResourcesService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- variables ---------------------------------------------------------

  /**
   * The server's editable environment variables, for the customer Settings UI.
   *
   * The schema (which variables exist, their labels, types and rules) lives on
   * the GameTemplate; a per-server ServerVariable row only exists once the
   * customer overrides a value. We therefore MERGE the template's variables with
   * any override rows so every configurable variable shows up — even on a server
   * that has never had a row written (previously this returned `[]`, so e.g. a
   * Discord bot's BOT_TOKEN field never appeared). A variable the template marks
   * neither viewable nor editable is internal plumbing and is hidden.
   *
   * Write-only secrets (userViewable=false, e.g. BOT_TOKEN) never return their
   * stored value — only an `isSet` flag — so the token isn't shipped to the
   * browser; the field still accepts a new value.
   */
  async listVariables(serverId: string) {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      select: {
        memoryMb: true,
        variables: { select: { envName: true, value: true } },
        template: {
          select: {
            variables: {
              orderBy: { sortOrder: "asc" },
              select: {
                envName: true,
                displayName: true,
                description: true,
                type: true,
                defaultValue: true,
                rules: true,
                userEditable: true,
                userViewable: true,
              },
            },
          },
        },
      },
    });
    if (!server) throw new NotFoundException("Server not found");

    const overrides = new Map(
      server.variables.map((v) => [v.envName, v.value]),
    );

    return (server.template?.variables ?? [])
      .filter((v) => v.userViewable || v.userEditable)
      .map((v) => {
        let stored = overrides.has(v.envName)
          ? overrides.get(v.envName)!
          : (v.defaultValue ?? "");
        // SERVER_MEMORY (-Xmx) is system-managed from the RAM allocation, not
        // the stored/default value — show the effective heap so the Startup tab
        // matches what the JVM actually launches with.
        if (
          v.envName === SERVER_MEMORY_VAR &&
          !v.userEditable &&
          server.memoryMb > 0
        ) {
          stored = String(jvmHeapMb(server.memoryMb));
        }
        const writeOnly = !v.userViewable;
        return {
          envName: v.envName,
          displayName: v.displayName,
          description: v.description,
          type: v.type,
          rules: v.rules,
          userEditable: v.userEditable,
          userViewable: v.userViewable,
          // Hide the value of write-only secrets; expose only whether it's set.
          value: writeOnly ? "" : stored,
          isSet: writeOnly ? stored !== "" : undefined,
        };
      });
  }

  /**
   * Set/override an environment variable's value. For a variable the template
   * defines, we enforce `userEditable` and validate the value against the
   * template's rules (required/min/max/options). An envName NOT defined by the
   * template is allowed through as a custom variable (the customer already
   * controls the startup command, so arbitrary env is within their trust scope).
   */
  async setVariable(serverId: string, envName: string, value: string) {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      select: {
        id: true,
        template: {
          select: {
            variables: {
              where: { envName },
              select: {
                displayName: true,
                userEditable: true,
                rules: true,
              },
            },
          },
        },
      },
    });
    if (!server) throw new NotFoundException("Server not found");

    const def = server.template?.variables[0];
    if (def) {
      if (!def.userEditable) {
        throw new BadRequestException(`"${envName}" can't be edited`);
      }
      this.validateVariable(def.displayName || envName, def.rules, value);
    }

    return this.prisma.serverVariable.upsert({
      where: { serverId_envName: { serverId, envName } },
      create: { id: uuidv7(), serverId, envName, value },
      update: { value },
    });
  }

  /** Validate a value against a template variable's JSON rules. */
  private validateVariable(label: string, rules: unknown, value: string): void {
    const r = (rules ?? {}) as {
      required?: boolean;
      minLength?: number;
      maxLength?: number;
      options?: unknown[];
      regex?: string;
    };
    const trimmed = value.trim();
    if (r.required && trimmed === "") {
      throw new BadRequestException(`${label} is required`);
    }
    // An empty optional value clears the override — skip the rest.
    if (trimmed === "" && !r.required) return;
    if (typeof r.minLength === "number" && value.length < r.minLength) {
      throw new BadRequestException(
        `${label} must be at least ${r.minLength} characters`,
      );
    }
    if (typeof r.maxLength === "number" && value.length > r.maxLength) {
      throw new BadRequestException(
        `${label} must be at most ${r.maxLength} characters`,
      );
    }
    if (
      Array.isArray(r.options) &&
      r.options.length &&
      !r.options.includes(value)
    ) {
      throw new BadRequestException(
        `${label} must be one of the allowed values`,
      );
    }
    if (typeof r.regex === "string" && r.regex) {
      let re: RegExp | null = null;
      try {
        re = new RegExp(r.regex);
      } catch {
        re = null; // a bad pattern in the egg shouldn't block the customer
      }
      if (re && !re.test(value)) {
        throw new BadRequestException(`${label} is not in the expected format`);
      }
    }
  }

  async deleteVariable(serverId: string, envName: string) {
    await this.prisma.serverVariable.deleteMany({
      where: { serverId, envName },
    });
  }

  // ---- Java version selector ---------------------------------------------

  /**
   * Read the effective JVM major for a Java/Minecraft server: the customer's
   * override if set, else the version auto-selected from MINECRAFT_VERSION.
   */
  async getJavaVersion(serverId: string) {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      select: {
        dockerImage: true,
        environment: true,
        variables: { select: { envName: true, value: true } },
        template: {
          select: {
            variables: {
              where: { envName: "MINECRAFT_VERSION" },
              select: { defaultValue: true },
            },
          },
        },
      },
    });
    if (!server) throw new NotFoundException("Server not found");
    if (!isJavaImage(server.dockerImage)) {
      throw new BadRequestException("This server does not run on Java");
    }

    const vars = new Map(server.variables.map((v) => [v.envName, v.value]));
    const env = (server.environment ?? {}) as Record<string, unknown>;
    const readVar = (name: string): string | undefined =>
      vars.get(name) ?? (env[name] != null ? String(env[name]) : undefined);

    const mcVersion =
      readVar("MINECRAFT_VERSION") ??
      server.template?.variables[0]?.defaultValue ??
      undefined;
    const override = parseJavaOverride(readVar(JAVA_VERSION_VAR));
    const auto = requiredJavaMajor(mcVersion);

    return {
      selected: override ? String(override) : "auto",
      effective: override ?? auto,
      auto,
      options: [...SUPPORTED_JAVA_MAJORS],
    };
  }

  /**
   * Pin (or clear, with "auto") the JVM major for a Java/Minecraft server.
   * Stored as a JAVA_VERSION override the install-spec builder honors on the
   * next (re)install/restart. Returns the refreshed selector state.
   */
  async setJavaVersion(serverId: string, value: string) {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      select: { id: true, dockerImage: true },
    });
    if (!server) throw new NotFoundException("Server not found");
    if (!isJavaImage(server.dockerImage)) {
      throw new BadRequestException("This server does not run on Java");
    }

    const t = (value ?? "").trim().toLowerCase();
    if (t === "" || t === "auto") {
      await this.prisma.serverVariable.deleteMany({
        where: { serverId, envName: JAVA_VERSION_VAR },
      });
      return this.getJavaVersion(serverId);
    }

    const major = parseJavaOverride(t);
    if (!major) {
      throw new BadRequestException(
        `Unsupported Java version. Choose auto or one of: ${SUPPORTED_JAVA_MAJORS.join(", ")}`,
      );
    }
    await this.prisma.serverVariable.upsert({
      where: { serverId_envName: { serverId, envName: JAVA_VERSION_VAR } },
      create: {
        id: uuidv7(),
        serverId,
        envName: JAVA_VERSION_VAR,
        value: String(major),
      },
      update: { value: String(major) },
    });
    return this.getJavaVersion(serverId);
  }

  // ---- allocations -------------------------------------------------------

  listAllocations(serverId: string) {
    return this.prisma.allocation.findMany({ where: { serverId } });
  }

  /** Attach a free allocation on the server's node, or create one. */
  async addAllocation(serverId: string, dto: CreateAllocationDto) {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      select: { nodeId: true },
    });
    if (!server) throw new NotFoundException("Server not found");

    const existing = await this.prisma.allocation.findUnique({
      where: {
        nodeId_ip_port: { nodeId: server.nodeId, ip: dto.ip, port: dto.port },
      },
    });
    if (existing?.serverId && existing.serverId !== serverId) {
      throw new ConflictException("Allocation already assigned");
    }

    if (dto.isPrimary) {
      await this.prisma.allocation.updateMany({
        where: { serverId },
        data: { isPrimary: false },
      });
    }

    if (existing) {
      return this.prisma.allocation.update({
        where: { id: existing.id },
        data: { serverId, isPrimary: dto.isPrimary ?? false },
      });
    }
    return this.prisma.allocation.create({
      data: {
        id: uuidv7(),
        nodeId: server.nodeId,
        ip: dto.ip,
        port: dto.port,
        serverId,
        isPrimary: dto.isPrimary ?? false,
      },
    });
  }

  async removeAllocation(serverId: string, allocationId: string) {
    const alloc = await this.prisma.allocation.findFirst({
      where: { id: allocationId, serverId },
    });
    if (!alloc) throw new NotFoundException("Allocation not found");
    if (alloc.isPrimary) {
      throw new ConflictException("Cannot remove the primary allocation");
    }
    await this.prisma.allocation.update({
      where: { id: allocationId },
      data: { serverId: null },
    });
  }

  // ---- sub-users ---------------------------------------------------------

  listSubUsers(serverId: string) {
    return this.prisma.subUser.findMany({
      where: { serverId },
      include: { user: { select: { id: true, email: true } } },
    });
  }

  async addSubUser(serverId: string, dto: AddSubUserDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase(), deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new NotFoundException("No user with that email");

    const existing = await this.prisma.subUser.findUnique({
      where: { serverId_userId: { serverId, userId: user.id } },
    });
    if (existing) {
      return this.prisma.subUser.update({
        where: { id: existing.id },
        data: { permissions: dto.permissions, state: "ACTIVE" },
      });
    }
    return this.prisma.subUser.create({
      data: {
        id: uuidv7(),
        serverId,
        userId: user.id,
        permissions: dto.permissions,
        state: "ACTIVE",
      },
    });
  }

  async updateSubUser(
    serverId: string,
    subUserId: string,
    permissions: string[],
  ) {
    const sub = await this.prisma.subUser.findFirst({
      where: { id: subUserId, serverId },
    });
    if (!sub) throw new NotFoundException("Sub-user not found");
    return this.prisma.subUser.update({
      where: { id: subUserId },
      data: { permissions },
    });
  }

  async revokeSubUser(serverId: string, subUserId: string) {
    await this.prisma.subUser.updateMany({
      where: { id: subUserId, serverId },
      data: { state: "REVOKED" },
    });
  }

  // ---- schedules ---------------------------------------------------------

  listSchedules(serverId: string) {
    return this.prisma.schedule.findMany({
      where: { serverId },
      include: { tasks: { orderBy: { sortOrder: "asc" } } },
    });
  }

  /** The server owner's IANA timezone (drives cron interpretation). */
  private async ownerTimezone(serverId: string): Promise<string> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      select: { owner: { select: { timezone: true } } },
    });
    return server?.owner?.timezone || "UTC";
  }

  async createSchedule(serverId: string, dto: CreateScheduleDto) {
    if (!isValidCron(dto.cron)) {
      throw new BadRequestException("Invalid cron expression");
    }
    const isActive = dto.isActive ?? true;
    const tz = await this.ownerTimezone(serverId);
    return this.prisma.schedule.create({
      data: {
        id: uuidv7(),
        serverId,
        name: dto.name,
        cron: dto.cron,
        onlyWhenOnline: dto.onlyWhenOnline ?? false,
        isActive,
        // Only schedule a next run when active; cron is interpreted in the
        // owner's timezone (so "4am" means 4am for them).
        nextRunAt: isActive ? nextCronRun(dto.cron, new Date(), tz) : null,
        tasks: {
          create: (dto.tasks ?? []).map((t, i) => ({
            id: uuidv7(),
            action: t.action,
            payload: t.payload,
            timeOffsetMs: t.timeOffsetMs ?? 0,
            sortOrder: t.sortOrder ?? i,
            continueOnFailure: t.continueOnFailure ?? false,
            options: taskOptions(t),
          })),
        },
      },
      include: { tasks: { orderBy: { sortOrder: "asc" } } },
    });
  }

  async updateSchedule(
    serverId: string,
    scheduleId: string,
    dto: UpdateScheduleDto,
  ) {
    const existing = await this.prisma.schedule.findFirst({
      where: { id: scheduleId, serverId },
    });
    if (!existing) throw new NotFoundException("Schedule not found");
    if (dto.cron !== undefined && !isValidCron(dto.cron)) {
      throw new BadRequestException("Invalid cron expression");
    }
    const cron = dto.cron ?? existing.cron;
    const isActive = dto.isActive ?? existing.isActive;
    const tz = await this.ownerTimezone(serverId);
    const data: Prisma.ScheduleUpdateInput = {
      // Recompute the next run whenever cron / active state could have changed,
      // in the owner's timezone.
      nextRunAt: isActive ? nextCronRun(cron, new Date(), tz) : null,
    };
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.cron !== undefined) data.cron = dto.cron;
    if (dto.onlyWhenOnline !== undefined)
      data.onlyWhenOnline = dto.onlyWhenOnline;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.tasks !== undefined) {
      data.tasks = {
        deleteMany: {},
        create: dto.tasks.map((t, i) => ({
          id: uuidv7(),
          action: t.action,
          payload: t.payload,
          timeOffsetMs: t.timeOffsetMs ?? 0,
          sortOrder: t.sortOrder ?? i,
          continueOnFailure: t.continueOnFailure ?? false,
          options: taskOptions(t),
        })),
      };
    }
    return this.prisma.schedule.update({
      where: { id: scheduleId },
      data,
      include: { tasks: { orderBy: { sortOrder: "asc" } } },
    });
  }

  async deleteSchedule(serverId: string, scheduleId: string) {
    await this.prisma.schedule.deleteMany({
      where: { id: scheduleId, serverId },
    });
  }
}
