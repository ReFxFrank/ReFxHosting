import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StaffMember } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { uuidv7 } from '../common/util/uuid';
import { CreateStaffMemberDto, UpdateStaffMemberDto } from './dto/staff.dto';

/**
 * Admin-curated team members shown on the public "Meet the team" page. Pure
 * marketing content (not tied to user accounts); CRUD is admin-only (enforced at
 * the controller), the active list is public.
 */
@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active members for the public team page (ordered). */
  listActive(): Promise<StaffMember[]> {
    return this.prisma.staffMember.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Every member (admin view, incl. inactive). */
  listAll(): Promise<StaffMember[]> {
    return this.prisma.staffMember.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  create(dto: CreateStaffMemberDto): Promise<StaffMember> {
    return this.prisma.staffMember.create({
      data: {
        id: uuidv7(),
        name: dto.name,
        title: dto.title,
        bio: dto.bio,
        avatarUrl: dto.avatarUrl,
        link: dto.link,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async update(id: string, dto: UpdateStaffMemberDto): Promise<StaffMember> {
    const existing = await this.prisma.staffMember.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Team member not found');
    const data: Prisma.StaffMemberUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;
    if (dto.link !== undefined) data.link = dto.link;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    return this.prisma.staffMember.update({ where: { id }, data });
  }

  async delete(id: string): Promise<{ id: string }> {
    const existing = await this.prisma.staffMember.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Team member not found');
    await this.prisma.staffMember.delete({ where: { id } });
    return { id };
  }
}
