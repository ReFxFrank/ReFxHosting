import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { BugReport, GlobalRole, Prisma, UserState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../platform/notifications.service';
import { Paginated, paginate } from '../common/dto/pagination.dto';
import { uuidv7 } from '../common/util/uuid';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateBugReportDto } from './dto/create-bug-report.dto';
import { UpdateBugReportDto } from './dto/update-bug-report.dto';
import { AddBugCommentDto } from './dto/add-bug-comment.dto';
import { ListBugReportsQueryDto } from './dto/list-bug-reports-query.dto';

const STAFF_ROLES = new Set<string>([
  GlobalRole.SUPPORT,
  GlobalRole.ADMIN,
  GlobalRole.OWNER,
]);

/** Image attachment limits (stored inline in the DB — kept small on purpose). */
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MiB per image
const MAX_ATTACHMENTS_PER_REPORT = 4;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

/**
 * Bug reports: customers submit from the panel, staff triage on the admin
 * board. Distinct from support Tickets (help-me) — these are "something is
 * broken" with severity/status triage. The customer/staff split is enforced
 * here; admin-only routes are additionally gated by AdminPermissionGuard.
 */
@Injectable()
export class BugsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private isStaff(user: AuthUser): boolean {
    return STAFF_ROLES.has(user.globalRole);
  }

  // ---- create (customer) --------------------------------------------------

  async create(reporter: AuthUser, dto: CreateBugReportDto): Promise<BugReport> {
    // Only attach a server the reporter can actually see (owner or sub-user),
    // so context can't be used to probe others' server ids.
    let serverId: string | null = null;
    if (dto.serverId) {
      const server = await this.prisma.server.findFirst({
        where: {
          id: dto.serverId,
          deletedAt: null,
          OR: [
            { ownerId: reporter.id },
            { subUsers: { some: { userId: reporter.id } } },
          ],
        },
        select: { id: true },
      });
      serverId = server?.id ?? null;
    }

    const report = await this.prisma.bugReport.create({
      data: {
        id: uuidv7(),
        title: dto.title.trim(),
        description: dto.description,
        stepsToReproduce: dto.stepsToReproduce?.trim() || null,
        severity: dto.severity ?? undefined,
        reporterId: reporter.id,
        serverId,
        pageUrl: dto.pageUrl?.slice(0, 500) || null,
        userAgent: dto.userAgent?.slice(0, 400) || null,
        appVersion: dto.appVersion?.slice(0, 60) || null,
      },
    });

    // Notify all staff (best-effort) so a report never sits unseen.
    await this.notifyStaffOfNewReport(report).catch(() => undefined);
    return report;
  }

  private async notifyStaffOfNewReport(report: BugReport): Promise<void> {
    const staff = await this.prisma.user.findMany({
      where: {
        globalRole: { in: [GlobalRole.SUPPORT, GlobalRole.ADMIN, GlobalRole.OWNER] },
        state: UserState.ACTIVE,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!staff.length) return;
    await this.notifications.notifyMany(
      staff.map((s) => s.id),
      {
        title: `New bug report: BUG-${report.number}`,
        body: `${report.severity} · ${report.title}`,
      },
    );
  }

  // ---- list ---------------------------------------------------------------

  async list(
    user: AuthUser,
    query: ListBugReportsQueryDto,
  ): Promise<Paginated<unknown>> {
    // Customers only ever see their own; staff see everything but can also
    // self-scope with ?mine=true.
    const ownOnly = !this.isStaff(user) || query.mine === 'true';
    const where: Prisma.BugReportWhereInput = {
      ...(ownOnly ? { reporterId: user.id } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const staffView = this.isStaff(user);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.bugReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
        include: {
          reporter: staffView
            ? { select: { id: true, email: true, firstName: true, lastName: true } }
            : false,
          assignee: staffView
            ? { select: { id: true, email: true, firstName: true, lastName: true } }
            : false,
          server: { select: { id: true, shortId: true, name: true } },
          _count: { select: { comments: true, attachments: true } },
        },
      }),
      this.prisma.bugReport.count({ where }),
    ]);
    return paginate(rows, total, query);
  }

  /** Staff assignee picker. */
  async listStaff() {
    return this.prisma.user.findMany({
      where: {
        globalRole: { in: [GlobalRole.SUPPORT, GlobalRole.ADMIN, GlobalRole.OWNER] },
        deletedAt: null,
      },
      select: { id: true, email: true, firstName: true, lastName: true },
      orderBy: { email: 'asc' },
    });
  }

  // ---- get one ------------------------------------------------------------

  async get(user: AuthUser, id: string) {
    const staffView = this.isStaff(user);
    const report = await this.prisma.bugReport.findUnique({
      where: { id },
      include: {
        reporter: { select: { id: true, email: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, email: true, firstName: true, lastName: true } },
        server: { select: { id: true, shortId: true, name: true } },
        attachments: {
          select: { id: true, fileName: true, contentType: true, sizeBytes: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
        comments: {
          include: {
            author: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    // Hide existence from non-owners (404, not 403).
    if (!report || (!staffView && report.reporterId !== user.id)) {
      throw new NotFoundException('Bug report not found');
    }
    // Non-staff never see internal notes or reporter contact of others.
    if (!staffView) {
      report.comments = report.comments.filter((c) => !c.isInternal);
    }
    return report;
  }

  // ---- staff triage -------------------------------------------------------

  async update(id: string, dto: UpdateBugReportDto): Promise<BugReport> {
    const existing = await this.prisma.bugReport.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Bug report not found');

    if (dto.assigneeId) await this.assertStaffUser(dto.assigneeId);

    return this.prisma.bugReport.update({
      where: { id },
      data: {
        status: dto.status ?? undefined,
        severity: dto.severity ?? undefined,
        area: dto.area !== undefined ? dto.area || null : undefined,
        assigneeId:
          dto.assigneeId === null ? null : dto.assigneeId ?? undefined,
        resolutionNote:
          dto.resolutionNote !== undefined
            ? dto.resolutionNote || null
            : undefined,
      },
    });
  }

  // ---- comments -----------------------------------------------------------

  async addComment(user: AuthUser, id: string, dto: AddBugCommentDto) {
    const report = await this.prisma.bugReport.findUnique({
      where: { id },
      select: { id: true, reporterId: true },
    });
    const staff = this.isStaff(user);
    if (!report || (!staff && report.reporterId !== user.id)) {
      throw new NotFoundException('Bug report not found');
    }
    // isInternal is honored for staff only.
    const isInternal = staff ? !!dto.isInternal : false;
    return this.prisma.bugComment.create({
      data: {
        id: uuidv7(),
        bugReportId: id,
        authorId: user.id,
        body: dto.body,
        isInternal,
      },
      include: {
        author: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
  }

  // ---- delete (staff) -----------------------------------------------------

  async delete(id: string): Promise<void> {
    const existing = await this.prisma.bugReport.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Bug report not found');
    // Comments + attachments cascade.
    await this.prisma.bugReport.delete({ where: { id } });
  }

  // ---- attachments (inline, image-only, capped) ---------------------------

  async addAttachment(
    user: AuthUser,
    id: string,
    fileName: string,
    contentType: string,
    data: Buffer,
  ) {
    const report = await this.prisma.bugReport.findUnique({
      where: { id },
      select: { id: true, reporterId: true, _count: { select: { attachments: true } } },
    });
    if (!report || (!this.isStaff(user) && report.reporterId !== user.id)) {
      throw new NotFoundException('Bug report not found');
    }
    if (!data || data.length === 0) {
      throw new BadRequestException('Empty upload');
    }
    if (data.length > MAX_ATTACHMENT_BYTES) {
      throw new PayloadTooLargeException(
        `Attachment exceeds ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MiB`,
      );
    }
    const type = (contentType || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_ATTACHMENT_TYPES.has(type)) {
      throw new BadRequestException(
        'Only PNG, JPEG, WebP or GIF images can be attached',
      );
    }
    if (report._count.attachments >= MAX_ATTACHMENTS_PER_REPORT) {
      throw new BadRequestException(
        `A report can have at most ${MAX_ATTACHMENTS_PER_REPORT} attachments`,
      );
    }
    const att = await this.prisma.bugAttachment.create({
      data: {
        id: uuidv7(),
        bugReportId: id,
        fileName: (fileName || 'screenshot').slice(0, 200),
        contentType: type,
        sizeBytes: data.length,
        // Prisma Bytes expects a Uint8Array; copy the Buffer into a plain one
        // (Buffer's ArrayBufferLike variance trips strict TS otherwise).
        data: new Uint8Array(data),
      },
      select: { id: true, fileName: true, contentType: true, sizeBytes: true, createdAt: true },
    });
    return att;
  }

  /** Fetch an attachment's bytes for download (reporter or staff only). */
  async getAttachment(user: AuthUser, reportId: string, attachmentId: string) {
    const att = await this.prisma.bugAttachment.findFirst({
      where: { id: attachmentId, bugReportId: reportId },
      include: { bugReport: { select: { reporterId: true } } },
    });
    if (
      !att ||
      (!this.isStaff(user) && att.bugReport.reporterId !== user.id)
    ) {
      throw new NotFoundException('Attachment not found');
    }
    return {
      fileName: att.fileName,
      contentType: att.contentType,
      data: Buffer.from(att.data),
    };
  }

  private async assertStaffUser(userId: string): Promise<void> {
    const u = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { globalRole: true },
    });
    if (!u || !STAFF_ROLES.has(u.globalRole)) {
      throw new ForbiddenException('Assignee must be a staff member');
    }
  }
}
