import { Injectable, NotFoundException } from '@nestjs/common';
import { HomepageAlert, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { uuidv7 } from '../common/util/uuid';
import {
  CreateHomepageAlertDto,
  UpdateHomepageAlertDto,
} from './dto/homepage-alert.dto';

/**
 * Public-storefront homepage notices. Deliberately distinct from AlertsService
 * (internal dashboard GlobalAlerts): different model, different audience. Active
 * alerts (within their schedule window) are shown on the public homepage; CRUD
 * is admin-only (enforced at the controller).
 */
@Injectable()
export class HomepageAlertsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active alerts within their visibility window, highest priority first. */
  listActive(): Promise<HomepageAlert[]> {
    const now = new Date();
    return this.prisma.homepageAlert.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** Every alert (admin view, incl. inactive/expired). */
  listAll(): Promise<HomepageAlert[]> {
    return this.prisma.homepageAlert.findMany({
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  create(dto: CreateHomepageAlertDto): Promise<HomepageAlert> {
    return this.prisma.homepageAlert.create({
      data: {
        id: uuidv7(),
        type: dto.type,
        title: dto.title,
        body: dto.body,
        isActive: dto.isActive ?? true,
        startsAt: dto.startsAt ?? null,
        endsAt: dto.endsAt ?? null,
        ctaLabel: dto.ctaLabel ?? null,
        ctaUrl: dto.ctaUrl ?? null,
        dismissible: dto.dismissible ?? true,
        priority: dto.priority ?? 0,
      },
    });
  }

  async update(id: string, dto: UpdateHomepageAlertDto): Promise<HomepageAlert> {
    const existing = await this.prisma.homepageAlert.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Homepage alert not found');

    const data: Prisma.HomepageAlertUpdateInput = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.startsAt !== undefined) data.startsAt = dto.startsAt;
    if (dto.endsAt !== undefined) data.endsAt = dto.endsAt;
    if (dto.ctaLabel !== undefined) data.ctaLabel = dto.ctaLabel;
    if (dto.ctaUrl !== undefined) data.ctaUrl = dto.ctaUrl;
    if (dto.dismissible !== undefined) data.dismissible = dto.dismissible;
    if (dto.priority !== undefined) data.priority = dto.priority;

    return this.prisma.homepageAlert.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    const existing = await this.prisma.homepageAlert.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Homepage alert not found');
    await this.prisma.homepageAlert.delete({ where: { id } });
  }
}
