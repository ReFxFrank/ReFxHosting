import { Injectable, NotFoundException } from '@nestjs/common';
import { GlobalAlert, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { uuidv7 } from '../common/util/uuid';
import { CreateAlertDto } from './dto/create-alert.dto';

/**
 * Platform-wide banner/alert management. Active alerts are shown to all users;
 * creation/deactivation is admin-only (enforced at the controller).
 */
@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Alerts that are active *and* currently within their visibility window. A
   * null startsAt means "since forever"; a null endsAt means "until forever".
   */
  async listActiveAlerts(): Promise<GlobalAlert[]> {
    const now = new Date();
    const where: Prisma.GlobalAlertWhereInput = {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    };

    return this.prisma.globalAlert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Create a new platform alert (admin). */
  async createAlert(dto: CreateAlertDto): Promise<GlobalAlert> {
    return this.prisma.globalAlert.create({
      data: {
        id: uuidv7(),
        severity: dto.severity, // undefined falls back to schema default (INFO)
        title: dto.title,
        body: dto.body,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
      },
    });
  }

  /** Deactivate (hide) an alert without deleting it (admin). */
  async deactivateAlert(id: string): Promise<GlobalAlert> {
    const existing = await this.prisma.globalAlert.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Alert not found');

    return this.prisma.globalAlert.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
