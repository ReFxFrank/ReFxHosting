import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { uuidv7 } from '../common/util/uuid';
import {
  AddSubUserDto,
  CreateAllocationDto,
  CreateScheduleDto,
  SetVariableDto,
} from './dto/server.dto';

/**
 * Sub-resource operations scoped to a single server: variables, allocations,
 * sub-users, and schedules. Authorization is enforced upstream by
 * PermissionGuard on the controller.
 */
@Injectable()
export class ServerResourcesService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- variables ---------------------------------------------------------

  listVariables(serverId: string) {
    return this.prisma.serverVariable.findMany({ where: { serverId } });
  }

  setVariable(serverId: string, dto: SetVariableDto) {
    return this.prisma.serverVariable.upsert({
      where: { serverId_envName: { serverId, envName: dto.envName } },
      create: { id: uuidv7(), serverId, envName: dto.envName, value: dto.value },
      update: { value: dto.value },
    });
  }

  async deleteVariable(serverId: string, envName: string) {
    await this.prisma.serverVariable.deleteMany({ where: { serverId, envName } });
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
    if (!server) throw new NotFoundException('Server not found');

    const existing = await this.prisma.allocation.findUnique({
      where: {
        nodeId_ip_port: { nodeId: server.nodeId, ip: dto.ip, port: dto.port },
      },
    });
    if (existing?.serverId && existing.serverId !== serverId) {
      throw new ConflictException('Allocation already assigned');
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
    if (!alloc) throw new NotFoundException('Allocation not found');
    if (alloc.isPrimary) {
      throw new ConflictException('Cannot remove the primary allocation');
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
    if (!user) throw new NotFoundException('No user with that email');

    const existing = await this.prisma.subUser.findUnique({
      where: { serverId_userId: { serverId, userId: user.id } },
    });
    if (existing) {
      return this.prisma.subUser.update({
        where: { id: existing.id },
        data: { permissions: dto.permissions, state: 'ACTIVE' },
      });
    }
    return this.prisma.subUser.create({
      data: {
        id: uuidv7(),
        serverId,
        userId: user.id,
        permissions: dto.permissions,
        state: 'ACTIVE',
      },
    });
  }

  async updateSubUser(serverId: string, subUserId: string, permissions: string[]) {
    const sub = await this.prisma.subUser.findFirst({
      where: { id: subUserId, serverId },
    });
    if (!sub) throw new NotFoundException('Sub-user not found');
    return this.prisma.subUser.update({
      where: { id: subUserId },
      data: { permissions },
    });
  }

  async revokeSubUser(serverId: string, subUserId: string) {
    await this.prisma.subUser.updateMany({
      where: { id: subUserId, serverId },
      data: { state: 'REVOKED' },
    });
  }

  // ---- schedules ---------------------------------------------------------

  listSchedules(serverId: string) {
    return this.prisma.schedule.findMany({
      where: { serverId },
      include: { tasks: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  createSchedule(serverId: string, dto: CreateScheduleDto) {
    return this.prisma.schedule.create({
      data: {
        id: uuidv7(),
        serverId,
        name: dto.name,
        cron: dto.cron,
        onlyWhenOnline: dto.onlyWhenOnline ?? false,
        // TODO(impl): compute nextRunAt from cron (e.g. cron-parser) and have a
        // worker poll due schedules.
      },
    });
  }

  async deleteSchedule(serverId: string, scheduleId: string) {
    await this.prisma.schedule.deleteMany({
      where: { id: scheduleId, serverId },
    });
  }
}
