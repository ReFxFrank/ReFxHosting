import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CannedResponse,
  KbArticle,
  Prisma,
  Ticket,
  TicketCategory,
  TicketMessage,
  TicketPriority,
  TicketState,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  Paginated,
  PaginationDto,
  paginate,
} from '../common/dto/pagination.dto';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { uuidv7 } from '../common/util/uuid';
import { computeSlaStatus } from './sla.util';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { AddMessageDto } from './dto/add-message.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { CreateCannedResponseDto } from './dto/create-canned-response.dto';
import { UpdateCannedResponseDto } from './dto/update-canned-response.dto';
import { CreateKbArticleDto } from './dto/create-kb-article.dto';
import { UpdateKbArticleDto } from './dto/update-kb-article.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

/** Ticket with its messages eager-loaded (the common detail shape). */
export type TicketWithMessages = Ticket & { messages: TicketMessage[] };

const STAFF_ROLES = new Set(['SUPPORT', 'ADMIN', 'OWNER']);

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  /** Whether a principal is support staff (SUPPORT / ADMIN / OWNER). */
  private isStaff(user: AuthUser): boolean {
    return STAFF_ROLES.has(user.globalRole);
  }

  // ---- Tickets -----------------------------------------------------------

  /**
   * Open a new ticket plus its first (customer-visible) message in a single
   * transaction. The ticket `number` is a DB autoincrement and is omitted here.
   */
  async createTicket(
    requesterId: string,
    dto: CreateTicketDto,
  ): Promise<TicketWithMessages> {
    if (dto.categoryId) {
      await this.assertCategoryExists(dto.categoryId);
    }

    const ticketId = uuidv7();

    return this.prisma.ticket.create({
      data: {
        id: ticketId,
        subject: dto.subject,
        requesterId,
        categoryId: dto.categoryId ?? null,
        priority: dto.priority ?? undefined,
        state: TicketState.OPEN,
        messages: {
          create: {
            id: uuidv7(),
            authorId: requesterId,
            body: dto.body,
            isInternal: false,
          },
        },
      },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  /**
   * Paginated ticket list. Customers only see tickets they requested; staff see
   * all tickets. Optional free-text filter matches the subject.
   */
  async listTickets(
    user: AuthUser,
    pagination: PaginationDto,
    filter?: { state?: TicketState; priority?: TicketPriority; mine?: boolean },
  ): Promise<Paginated<Ticket>> {
    // The CLIENT AREA is always self-scoped: a staff member who is also a
    // customer sees only their OWN tickets there. The full queue is staff-only
    // and lives in the admin panel. `mine` lets the client area request the
    // self-scoped view from this shared endpoint (mirrors ServersService.list).
    const ownOnly = !this.isStaff(user) || !!filter?.mine;
    const where: Prisma.TicketWhereInput = {};
    if (ownOnly) {
      where.requesterId = user.id;
    }
    // ARCHIVED tickets are "stored away" — excluded from the default queue, only
    // shown when explicitly filtered to ARCHIVED.
    if (filter?.state) where.state = filter.state;
    else where.state = { not: TicketState.ARCHIVED };
    if (filter?.priority) where.priority = filter.priority;
    if (pagination.q) {
      where.subject = { contains: pagination.q, mode: 'insensitive' };
    }

    // The staff queue view resolves requester/assignee/category; the self-scoped
    // (client area / customer) view does not.
    const include: Prisma.TicketInclude | undefined = ownOnly
      ? undefined
      : {
          requester: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          assignee: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          _count: { select: { messages: true } },
        };


    const [data, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        include,
        skip: pagination.skip,
        take: pagination.take,
        // Most-recently-active first so the queue surfaces fresh replies.
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }

  /** Staff directory for the assignee picker (SUPPORT / ADMIN / OWNER). */
  listStaff() {
    return this.prisma.user.findMany({
      where: { deletedAt: null, globalRole: { in: ['SUPPORT', 'ADMIN', 'OWNER'] } },
      select: { id: true, email: true, firstName: true, lastName: true, globalRole: true },
      orderBy: [{ globalRole: 'desc' }, { firstName: 'asc' }],
    });
  }

  /**
   * Fetch a single ticket with its messages (ascending). Customers may only see
   * their own tickets, and internal notes are stripped from their view.
   */
  async getTicket(user: AuthUser, id: string): Promise<TicketWithMessages> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
                globalRole: true,
              },
            },
          },
        },
        requester: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        assignee: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (!this.isStaff(user)) {
      if (ticket.requesterId !== user.id) {
        // Hide existence from non-owners.
        throw new NotFoundException('Ticket not found');
      }
      ticket.messages = ticket.messages.filter((m) => !m.isInternal);
    }

    return ticket;
  }

  /**
   * Add a reply (or, for staff, an internal note) to a ticket. Handles SLA
   * first-response bookkeeping, state transitions and slaBreached recomputation.
   */
  async addMessage(
    user: AuthUser,
    ticketId: string,
    dto: AddMessageDto,
  ): Promise<TicketMessage> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const staff = this.isStaff(user);
    if (!staff && ticket.requesterId !== user.id) {
      throw new ForbiddenException('You cannot post on this ticket');
    }

    // Only staff may flag a message as an internal note.
    const isInternal = staff ? dto.isInternal ?? false : false;

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const message = await tx.ticketMessage.create({
        data: {
          id: uuidv7(),
          ticketId,
          authorId: user.id,
          body: dto.body,
          isInternal,
        },
      });

      // First staff response (public reply) stamps firstResponseAt.
      const firstResponseAt =
        staff && !isInternal && ticket.firstResponseAt === null
          ? now
          : ticket.firstResponseAt;

      // Public replies move the ticket between the two pending states.
      let state = ticket.state;
      if (!isInternal) {
        state = staff
          ? TicketState.PENDING_CUSTOMER
          : TicketState.PENDING_AGENT;
      }

      const category = ticket.categoryId
        ? await tx.ticketCategory.findUnique({
            where: { id: ticket.categoryId },
          })
        : null;

      const sla = computeSlaStatus(
        { ...ticket, firstResponseAt },
        category,
        now,
      );

      await tx.ticket.update({
        where: { id: ticketId },
        data: {
          firstResponseAt,
          state,
          slaBreached: sla.firstResponseBreached || sla.resolutionBreached,
        },
      });

      return message;
    });
  }

  /**
   * Staff-only patch of a ticket's workflow fields. Resolving stamps
   * resolvedAt; slaBreached is recomputed against the (possibly new) category.
   */
  async updateTicket(
    user: AuthUser,
    id: string,
    dto: UpdateTicketDto,
  ): Promise<Ticket> {
    if (!this.isStaff(user)) {
      throw new ForbiddenException('Only support staff can update tickets');
    }

    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (dto.assigneeId !== undefined && dto.assigneeId !== null) {
      await this.assertStaffUser(dto.assigneeId);
    }
    const nextCategoryId =
      dto.categoryId !== undefined ? dto.categoryId : ticket.categoryId;
    if (dto.categoryId) {
      await this.assertCategoryExists(dto.categoryId);
    }

    const now = new Date();

    const data: Prisma.TicketUpdateInput = {};
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.assigneeId !== undefined) {
      data.assignee = dto.assigneeId
        ? { connect: { id: dto.assigneeId } }
        : { disconnect: true };
    }
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;

    let resolvedAt = ticket.resolvedAt;
    if (dto.state !== undefined) {
      data.state = dto.state;
      if (dto.state === TicketState.RESOLVED && ticket.resolvedAt === null) {
        resolvedAt = now;
        data.resolvedAt = now;
      }
    }

    const category = nextCategoryId
      ? await this.prisma.ticketCategory.findUnique({
          where: { id: nextCategoryId },
        })
      : null;

    const sla = computeSlaStatus({ ...ticket, resolvedAt }, category, now);
    data.slaBreached = sla.firstResponseBreached || sla.resolutionBreached;

    return this.prisma.ticket.update({ where: { id }, data });
  }

  /** Staff convenience: assign a ticket to a staff member. */
  async assignTicket(
    user: AuthUser,
    id: string,
    assigneeId: string,
  ): Promise<Ticket> {
    return this.updateTicket(user, id, { assigneeId });
  }

  /**
   * Staff: archive a resolved/closed ticket — "store" it out of the active queue
   * while keeping the full record (and its messages). Only RESOLVED/CLOSED
   * tickets can be archived; reopen one first if it's still active.
   */
  async archiveTicket(user: AuthUser, id: string): Promise<Ticket> {
    if (!this.isStaff(user)) throw new ForbiddenException('Staff only');
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (
      ticket.state !== TicketState.RESOLVED &&
      ticket.state !== TicketState.CLOSED
    ) {
      throw new BadRequestException(
        'Only resolved or closed tickets can be archived.',
      );
    }
    return this.prisma.ticket.update({
      where: { id },
      data: { state: TicketState.ARCHIVED },
    });
  }

  /**
   * Staff: permanently delete a ticket and its messages (cascade). Guarded to
   * resolved/closed/archived tickets so an active conversation can't be deleted
   * out from under a customer.
   */
  async deleteTicket(user: AuthUser, id: string): Promise<{ id: string }> {
    if (!this.isStaff(user)) throw new ForbiddenException('Staff only');
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { id: true, state: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const deletable: TicketState[] = [
      TicketState.RESOLVED,
      TicketState.CLOSED,
      TicketState.ARCHIVED,
    ];
    if (!deletable.includes(ticket.state)) {
      throw new BadRequestException(
        'Only resolved, closed or archived tickets can be deleted.',
      );
    }
    await this.prisma.ticket.delete({ where: { id } });
    return { id };
  }

  // ---- Canned responses (staff) -----------------------------------------

  listCannedResponses(): Promise<CannedResponse[]> {
    return this.prisma.cannedResponse.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  createCannedResponse(
    dto: CreateCannedResponseDto,
  ): Promise<CannedResponse> {
    return this.prisma.cannedResponse.create({
      data: {
        id: uuidv7(),
        title: dto.title,
        body: dto.body,
        tags: dto.tags ?? [],
      },
    });
  }

  async updateCannedResponse(
    id: string,
    dto: UpdateCannedResponseDto,
  ): Promise<CannedResponse> {
    const existing = await this.prisma.cannedResponse.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Canned response not found');
    const data: Prisma.CannedResponseUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.tags !== undefined) data.tags = dto.tags;
    return this.prisma.cannedResponse.update({ where: { id }, data });
  }

  async deleteCannedResponse(id: string): Promise<{ id: string }> {
    const existing = await this.prisma.cannedResponse.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Canned response not found');
    await this.prisma.cannedResponse.delete({ where: { id } });
    return { id };
  }

  // ---- Knowledge base ----------------------------------------------------

  /** List KB articles. Customers only ever see published articles. */
  listArticles(user: AuthUser): Promise<KbArticle[]> {
    const where: Prisma.KbArticleWhereInput = this.isStaff(user)
      ? {}
      : { isPublished: true };
    return this.prisma.kbArticle.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** Fetch an article by slug and increment its view counter. */
  async getArticle(user: AuthUser, slug: string): Promise<KbArticle> {
    const article = await this.prisma.kbArticle.findUnique({
      where: { slug },
    });
    if (!article) throw new NotFoundException('Article not found');

    if (!this.isStaff(user) && !article.isPublished) {
      throw new NotFoundException('Article not found');
    }

    // TODO(impl): record the read into OpenSearch / analytics for popularity.
    return this.prisma.kbArticle.update({
      where: { id: article.id },
      data: { views: { increment: 1 } },
    });
  }

  async createArticle(dto: CreateKbArticleDto): Promise<KbArticle> {
    const existing = await this.prisma.kbArticle.findUnique({
      where: { slug: dto.slug },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('An article with that slug already exists');
    }

    // TODO(impl): index the article body in OpenSearch for full-text KB search.
    return this.prisma.kbArticle.create({
      data: {
        id: uuidv7(),
        slug: dto.slug,
        title: dto.title,
        body: dto.body,
        category: dto.category ?? null,
        isPublished: dto.isPublished ?? false,
      },
    });
  }

  async updateArticle(
    slug: string,
    dto: UpdateKbArticleDto,
  ): Promise<KbArticle> {
    const article = await this.prisma.kbArticle.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!article) throw new NotFoundException('Article not found');

    const data: Prisma.KbArticleUpdateInput = {};
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.isPublished !== undefined) data.isPublished = dto.isPublished;

    // TODO(impl): re-index the updated article in OpenSearch.
    return this.prisma.kbArticle.update({ where: { id: article.id }, data });
  }

  // ---- Categories --------------------------------------------------------

  listCategories(): Promise<TicketCategory[]> {
    return this.prisma.ticketCategory.findMany({ orderBy: { name: 'asc' } });
  }

  async createCategory(dto: CreateCategoryDto): Promise<TicketCategory> {
    const existing = await this.prisma.ticketCategory.findUnique({
      where: { slug: dto.slug },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('A category with that slug already exists');
    }

    return this.prisma.ticketCategory.create({
      data: {
        id: uuidv7(),
        name: dto.name,
        slug: dto.slug,
        slaFirstResponseMin: dto.slaFirstResponseMin ?? undefined,
        slaResolutionMin: dto.slaResolutionMin ?? undefined,
      },
    });
  }

  async updateCategory(
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<TicketCategory> {
    const category = await this.prisma.ticketCategory.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Category not found');

    if (dto.slug) {
      const clash = await this.prisma.ticketCategory.findUnique({
        where: { slug: dto.slug },
        select: { id: true },
      });
      if (clash && clash.id !== id) {
        throw new ConflictException('A category with that slug already exists');
      }
    }

    const data: Prisma.TicketCategoryUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.slaFirstResponseMin !== undefined) {
      data.slaFirstResponseMin = dto.slaFirstResponseMin;
    }
    if (dto.slaResolutionMin !== undefined) {
      data.slaResolutionMin = dto.slaResolutionMin;
    }
    return this.prisma.ticketCategory.update({ where: { id }, data });
  }

  /** Delete a category, first detaching it from any tickets/messages. */
  async deleteCategory(id: string): Promise<{ id: string }> {
    const category = await this.prisma.ticketCategory.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Category not found');

    await this.prisma.$transaction([
      this.prisma.ticket.updateMany({
        where: { categoryId: id },
        data: { categoryId: null },
      }),
      this.prisma.ticketMessage.updateMany({
        where: { categoryId: id },
        data: { categoryId: null },
      }),
      this.prisma.ticketCategory.delete({ where: { id } }),
    ]);
    return { id };
  }

  // ---- Helpers -----------------------------------------------------------

  private async assertCategoryExists(id: string): Promise<void> {
    const category = await this.prisma.ticketCategory.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Ticket category not found');
  }

  private async assertStaffUser(id: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { globalRole: true },
    });
    if (!user) throw new NotFoundException('Assignee not found');
    if (!STAFF_ROLES.has(user.globalRole)) {
      throw new ForbiddenException('Tickets can only be assigned to staff');
    }
  }
}
