import { UseGuards } from '@nestjs/common';
import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { KbArticle, Ticket } from '@prisma/client';
import { SupportService } from './support.service';
import { TicketModel } from './models/ticket.model';
import { KbArticleModel } from './models/kb-article.model';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';

@Resolver(() => TicketModel)
@UseGuards(JwtAuthGuard)
export class SupportResolver {
  constructor(private readonly support: SupportService) {}

  /** The caller's own tickets (staff still see only their requester tickets here). */
  @Query(() => [TicketModel], { name: 'myTickets' })
  async myTickets(
    @CurrentUser() user: AuthUser,
  ): Promise<TicketModel[]> {
    // Scope to the caller regardless of staff status for the "my" query.
    const scoped: AuthUser = { ...user, globalRole: 'CUSTOMER' };
    const pagination = new PaginationDto();
    pagination.pageSize = 100;
    const result = await this.support.listTickets(scoped, pagination);
    return result.data.map(SupportResolver.toTicketModel);
  }

  /** A single ticket the caller is allowed to see. */
  @Query(() => TicketModel, { name: 'ticket' })
  async ticket(
    @CurrentUser() user: AuthUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<TicketModel> {
    const ticket = await this.support.getTicket(user, id);
    return SupportResolver.toTicketModel(ticket);
  }

  /** Published KB articles (staff also see drafts). */
  @Query(() => [KbArticleModel], { name: 'kbArticles' })
  async kbArticles(
    @CurrentUser() user: AuthUser,
  ): Promise<KbArticleModel[]> {
    const articles = await this.support.listArticles(user);
    return articles.map(SupportResolver.toKbArticleModel);
  }

  // ---- Mappers -----------------------------------------------------------

  private static toTicketModel(ticket: Ticket): TicketModel {
    return {
      id: ticket.id,
      number: ticket.number,
      subject: ticket.subject,
      state: ticket.state,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      slaBreached: ticket.slaBreached,
    };
  }

  private static toKbArticleModel(article: KbArticle): KbArticleModel {
    return {
      id: article.id,
      slug: article.slug,
      title: article.title,
      body: article.body,
      category: article.category,
      isPublished: article.isPublished,
      views: article.views,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
    };
  }
}
