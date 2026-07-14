import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Paginated, paginate } from '../common/dto/pagination.dto';
import { AuditQueryDto } from './dto/audit-query.dto';

/**
 * An audit row joined with the acting user's display identity. The select is a
 * STRICT whitelist — the audit browsers need "who did it", never the rest of
 * the User row (password hash, encrypted TOTP seed, address, …).
 */
export type AuditLogWithActor = Prisma.AuditLogGetPayload<{
  include: {
    actor: { select: { email: true; firstName: true; lastName: true } };
  };
}>;

/**
 * Read-side service over the AuditLog table. Writes are produced by the
 * AuditInterceptor on mutating routes; this service powers the admin audit
 * browser.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Admin-facing, filtered + paginated audit log listing, newest first. Each
   * row carries the acting user's email/name (`actor`) so the admin UIs can
   * show who acted instead of a bare actorId UUID; system-generated entries
   * (null actorId) come back with `actor: null`.
   */
  async listAuditLogs(
    filter: AuditQueryDto,
  ): Promise<Paginated<AuditLogWithActor>> {
    const where: Prisma.AuditLogWhereInput = {};

    if (filter.actorId) where.actorId = filter.actorId;
    if (filter.targetType) where.targetType = filter.targetType;
    if (filter.targetId) where.targetId = filter.targetId;
    if (filter.action) where.action = filter.action;

    if (filter.from || filter.to) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (filter.from) createdAt.gte = filter.from;
      if (filter.to) createdAt.lte = filter.to;
      where.createdAt = createdAt;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: filter.skip,
        take: filter.take,
        include: {
          actor: {
            select: { email: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return paginate(data, total, {
      page: filter.page,
      pageSize: filter.pageSize,
    });
  }
}
