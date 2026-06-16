import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GlobalRole, TicketPriority, TicketState } from '@prisma/client';
import { SupportService } from './support.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { AddMessageDto } from './dto/add-message.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { CreateCannedResponseDto } from './dto/create-canned-response.dto';
import { CreateKbArticleDto } from './dto/create-kb-article.dto';
import { UpdateKbArticleDto } from './dto/update-kb-article.dto';
import { CreateCategoryDto } from './dto/create-category.dto';

/** Body for the assign endpoint. */
class AssignTicketBody {
  assigneeId!: string;
}

@ApiTags('support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  // ---- Tickets -----------------------------------------------------------

  @Get('tickets')
  listTickets(
    @CurrentUser() user: AuthUser,
    @Query() pagination: PaginationDto,
    @Query('state') state?: TicketState,
    @Query('priority') priority?: TicketPriority,
  ) {
    return this.support.listTickets(user, pagination, { state, priority });
  }

  /** Staff directory for the assignee picker. */
  @Get('staff')
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.SUPPORT)
  listStaff() {
    return this.support.listStaff();
  }

  @Post('tickets')
  @Audit({ action: 'support.ticket.create', targetType: 'Ticket' })
  createTicket(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTicketDto,
  ) {
    return this.support.createTicket(userId, dto);
  }

  @Get('tickets/:id')
  getTicket(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.support.getTicket(user, id);
  }

  @Patch('tickets/:id')
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.SUPPORT)
  @Audit({
    action: 'support.ticket.update',
    targetType: 'Ticket',
    targetParam: 'id',
  })
  updateTicket(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
  ) {
    return this.support.updateTicket(user, id, dto);
  }

  @Post('tickets/:id/messages')
  @Audit({
    action: 'support.ticket.message',
    targetType: 'Ticket',
    targetParam: 'id',
  })
  addMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddMessageDto,
  ) {
    return this.support.addMessage(user, id, dto);
  }

  @Post('tickets/:id/assign')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.SUPPORT)
  @Audit({
    action: 'support.ticket.assign',
    targetType: 'Ticket',
    targetParam: 'id',
  })
  assignTicket(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: AssignTicketBody,
  ) {
    return this.support.assignTicket(user, id, body.assigneeId);
  }

  // ---- Canned responses (staff) -----------------------------------------

  @Get('canned-responses')
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.SUPPORT)
  listCannedResponses() {
    return this.support.listCannedResponses();
  }

  @Post('canned-responses')
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.SUPPORT)
  @Audit({ action: 'support.canned.create', targetType: 'CannedResponse' })
  createCannedResponse(@Body() dto: CreateCannedResponseDto) {
    return this.support.createCannedResponse(dto);
  }

  @Delete('canned-responses/:id')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.SUPPORT)
  @Audit({
    action: 'support.canned.delete',
    targetType: 'CannedResponse',
    targetParam: 'id',
  })
  deleteCannedResponse(@Param('id') id: string) {
    return this.support.deleteCannedResponse(id);
  }

  // ---- Knowledge base ----------------------------------------------------

  @Get('kb-articles')
  listArticles(@CurrentUser() user: AuthUser) {
    return this.support.listArticles(user);
  }

  // Web-facing aliases (`/support/kb`) for the knowledge base.
  @Get('kb')
  listKb(@CurrentUser() user: AuthUser) {
    return this.support.listArticles(user);
  }

  @Get('kb-articles/:slug')
  getArticle(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.support.getArticle(user, slug);
  }

  @Get('kb/:slug')
  getKbArticle(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.support.getArticle(user, slug);
  }

  @Post('kb-articles')
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.SUPPORT)
  @Audit({ action: 'support.kb.create', targetType: 'KbArticle' })
  createArticle(@Body() dto: CreateKbArticleDto) {
    return this.support.createArticle(dto);
  }

  @Patch('kb-articles/:slug')
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.SUPPORT)
  @Audit({
    action: 'support.kb.update',
    targetType: 'KbArticle',
    targetParam: 'slug',
  })
  updateArticle(
    @Param('slug') slug: string,
    @Body() dto: UpdateKbArticleDto,
  ) {
    return this.support.updateArticle(slug, dto);
  }

  // ---- Categories --------------------------------------------------------

  @Get('categories')
  listCategories() {
    return this.support.listCategories();
  }

  @Post('categories')
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.ADMIN)
  @Audit({ action: 'support.category.create', targetType: 'TicketCategory' })
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.support.createCategory(dto);
  }
}
