import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IncidentImpact, IncidentStatus, Prisma, UserState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { uuidv7 } from '../common/util/uuid';
import { NotificationsService } from './notifications.service';
import { PushService } from '../push/push.service';
import { EmailService } from '../email/email.service';
import {
  CreateIncidentDto,
  UpdateIncidentDto,
  AddIncidentUpdateDto,
} from './dto/incident.dto';

const incidentInclude = {
  updates: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.StatusIncidentInclude;

/** How long resolved incidents stay visible on the public status history. */
const HISTORY_DAYS = 30;
const HISTORY_LIMIT = 15;

/**
 * Operator-posted status incidents. Drives the public /status page history and,
 * while unresolved, the displayed status of affected components.
 */
@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
    private readonly email: EmailService,
  ) {}

  /** Admin: every incident, newest first, with its update timeline. */
  listAll() {
    return this.prisma.statusIncident.findMany({
      include: incidentInclude,
      orderBy: { startedAt: 'desc' },
    });
  }

  /** Public: active incidents + recent resolved ones (history). */
  async listPublic() {
    const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000);
    const [active, recent] = await Promise.all([
      this.prisma.statusIncident.findMany({
        where: { resolvedAt: null },
        include: incidentInclude,
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.statusIncident.findMany({
        where: { resolvedAt: { not: null, gte: since } },
        include: incidentInclude,
        orderBy: { resolvedAt: 'desc' },
        take: HISTORY_LIMIT,
      }),
    ]);
    return { active, recent };
  }

  /** Active (unresolved) incidents, used to override component status. */
  activeIncidents() {
    return this.prisma.statusIncident.findMany({
      where: { resolvedAt: null },
      select: { impact: true, components: true },
    });
  }

  /** Create an incident with its first timeline update. */
  async create(dto: CreateIncidentDto) {
    const status = dto.status ?? IncidentStatus.INVESTIGATING;
    const incident = await this.prisma.statusIncident.create({
      data: {
        id: uuidv7(),
        title: dto.title,
        impact: dto.impact,
        status,
        components: dto.components ?? [],
        ...(status === IncidentStatus.RESOLVED ? { resolvedAt: new Date() } : {}),
        updates: { create: [{ id: uuidv7(), status, body: dto.body }] },
      },
      include: incidentInclude,
    });

    // Opt-in broadcast (in-app + push + email) to all active customers. Detached
    // so a large fan-out never blocks the admin request; best-effort.
    if (dto.notify) {
      void this.broadcast(incident.id, dto.title, dto.body, dto.impact).catch((e) =>
        this.logger.warn(`incident broadcast failed: ${String(e)}`),
      );
    }
    return incident;
  }

  /** Fan a major incident out to every active customer. Best-effort. */
  private async broadcast(
    incidentId: string,
    title: string,
    body: string,
    impact: IncidentImpact,
  ): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { state: UserState.ACTIVE, deletedAt: null },
      select: { id: true, email: true, firstName: true },
    });
    if (!users.length) return;
    this.logger.log(`Broadcasting incident ${incidentId} to ${users.length} user(s)`);

    // In-app notifications in one batch.
    await this.notifications
      .notifyMany(
        users.map((u) => u.id),
        { title: `Service status: ${title}`, body },
      )
      .catch(() => undefined);

    // Push + email, chunked to bound concurrency.
    const CHUNK = 25;
    for (let i = 0; i < users.length; i += CHUNK) {
      const batch = users.slice(i, i + CHUNK);
      await Promise.allSettled(
        batch.flatMap((u) => [
          this.push.sendToUser(u.id, {
            title: `Service status: ${title}`,
            body,
            type: 'status.incident',
            data: { incidentId },
          }),
          this.email.sendIncidentNotice(
            { email: u.email, firstName: u.firstName ?? undefined },
            { title, body, impact },
          ),
        ]),
      );
    }
  }

  /** Append a timeline update; syncs the incident's status + resolvedAt. */
  async addUpdate(id: string, dto: AddIncidentUpdateDto) {
    await this.get(id);
    const resolving = dto.status === IncidentStatus.RESOLVED;
    await this.prisma.$transaction([
      this.prisma.statusIncidentUpdate.create({
        data: { id: uuidv7(), incidentId: id, status: dto.status, body: dto.body },
      }),
      this.prisma.statusIncident.update({
        where: { id },
        data: {
          status: dto.status,
          resolvedAt: resolving ? new Date() : null,
        },
      }),
    ]);
    return this.get(id);
  }

  /** Patch incident fields directly (corrections / manual resolve). */
  async update(id: string, dto: UpdateIncidentDto) {
    await this.get(id);
    const data: Prisma.StatusIncidentUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.impact !== undefined) data.impact = dto.impact;
    if (dto.components !== undefined) data.components = dto.components;
    if (dto.status !== undefined) {
      data.status = dto.status;
      data.resolvedAt = dto.status === IncidentStatus.RESOLVED ? new Date() : null;
    }
    return this.prisma.statusIncident.update({
      where: { id },
      data,
      include: incidentInclude,
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.statusIncident.delete({ where: { id } });
  }

  private async get(id: string) {
    const found = await this.prisma.statusIncident.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Incident not found');
    return found;
  }

  /** Map an impact onto the public status vocabulary. */
  static impactLevel(impact: IncidentImpact): 'maintenance' | 'degraded' | 'outage' {
    return impact === IncidentImpact.OUTAGE
      ? 'outage'
      : impact === IncidentImpact.MAINTENANCE
        ? 'maintenance'
        : 'degraded';
  }
}
