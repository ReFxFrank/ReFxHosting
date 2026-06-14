import { Injectable } from '@nestjs/common';
import { AuditLog, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Paginated, paginate } from '../common/dto/pagination.dto';
import { AuditQueryDto } from './dto/audit-query.dto';

/**
 * Read-side service over the AuditLog table. Writes are produced by the
 * AuditInterceptor on mutating routes; this service powers the admin audit
 * browser.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Admin-facing, filtered + paginated audit log listing, newest first.
   */
  async listAuditLogs(filter: AuditQueryDto): Promise<Paginated<AuditLog>> {
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
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return paginate(data, total, {
      page: filter.page,
      pageSize: filter.pageSize,
    });
  }
}
