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
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SupportService } from "./support.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AdminPermissionGuard } from "../auth/guards/admin-permission.guard";
import {
  AuthUser,
  CurrentUser,
} from "../common/decorators/current-user.decorator";
import { RequirePerm } from "../common/decorators/require-permission.decorator";
import { Public } from "../common/decorators/public.decorator";
import { Audit } from "../common/decorators/audit.decorator";
import { ListTicketsQueryDto } from "./dto/list-tickets-query.dto";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { AddMessageDto } from "./dto/add-message.dto";
import { UpdateTicketDto } from "./dto/update-ticket.dto";
import { CreateCannedResponseDto } from "./dto/create-canned-response.dto";
import { UpdateCannedResponseDto } from "./dto/update-canned-response.dto";
import { CreateKbArticleDto } from "./dto/create-kb-article.dto";
import { UpdateKbArticleDto } from "./dto/update-kb-article.dto";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";

/** Body for the assign endpoint. */
class AssignTicketBody {
  assigneeId!: string;
}

@ApiTags("support")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("support")
export class SupportController {
  constructor(private readonly support: SupportService) {}

  // ---- Tickets -----------------------------------------------------------

  @Get("tickets")
  listTickets(
    @CurrentUser() user: AuthUser,
    @Query() query: ListTicketsQueryDto,
  ) {
    return this.support.listTickets(user, query, {
      state: query.state,
      priority: query.priority,
      mine: query.mine === "true",
    });
  }

  /** Staff directory for the assignee picker. */
  @Get("staff")
  @UseGuards(AdminPermissionGuard)
  @RequirePerm("support.read")
  listStaff() {
    return this.support.listStaff();
  }

  @Post("tickets")
  @Audit({ action: "support.ticket.create", targetType: "Ticket" })
  createTicket(
    @CurrentUser("id") userId: string,
    @Body() dto: CreateTicketDto,
  ) {
    return this.support.createTicket(userId, dto);
  }

  @Get("tickets/:id")
  getTicket(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.support.getTicket(user, id);
  }

  @Patch("tickets/:id")
  @UseGuards(AdminPermissionGuard)
  @RequirePerm("support.manage")
  @Audit({
    action: "support.ticket.update",
    targetType: "Ticket",
    targetParam: "id",
  })
  updateTicket(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateTicketDto,
  ) {
    return this.support.updateTicket(user, id, dto);
  }

  @Post("tickets/:id/messages")
  @Audit({
    action: "support.ticket.message",
    targetType: "Ticket",
    targetParam: "id",
  })
  addMessage(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: AddMessageDto,
  ) {
    return this.support.addMessage(user, id, dto);
  }

  /** Close a ticket — staff OR the requester (customer "Close ticket" button). */
  @Post("tickets/:id/close")
  @HttpCode(200)
  @Audit({
    action: "support.ticket.close",
    targetType: "Ticket",
    targetParam: "id",
  })
  closeTicket(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.support.closeTicket(user, id);
  }

  @Post("tickets/:id/assign")
  @HttpCode(200)
  @UseGuards(AdminPermissionGuard)
  @RequirePerm("support.manage")
  @Audit({
    action: "support.ticket.assign",
    targetType: "Ticket",
    targetParam: "id",
  })
  assignTicket(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: AssignTicketBody,
  ) {
    return this.support.assignTicket(user, id, body.assigneeId);
  }

  /** Archive (store away) a resolved/closed ticket. */
  @Post("tickets/:id/archive")
  @HttpCode(200)
  @UseGuards(AdminPermissionGuard)
  @RequirePerm("support.manage")
  @Audit({
    action: "support.ticket.archive",
    targetType: "Ticket",
    targetParam: "id",
  })
  archiveTicket(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.support.archiveTicket(user, id);
  }

  /** Permanently delete a resolved/closed/archived ticket (messages cascade). */
  @Delete("tickets/:id")
  @HttpCode(204)
  @UseGuards(AdminPermissionGuard)
  @RequirePerm("support.manage")
  @Audit({
    action: "support.ticket.delete",
    targetType: "Ticket",
    targetParam: "id",
  })
  async deleteTicket(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.support.deleteTicket(user, id);
  }

  // ---- Canned responses (staff) -----------------------------------------

  @Get("canned-responses")
  @UseGuards(AdminPermissionGuard)
  @RequirePerm("support.read")
  listCannedResponses() {
    return this.support.listCannedResponses();
  }

  @Post("canned-responses")
  @UseGuards(AdminPermissionGuard)
  @RequirePerm("support.manage")
  @Audit({ action: "support.canned.create", targetType: "CannedResponse" })
  createCannedResponse(@Body() dto: CreateCannedResponseDto) {
    return this.support.createCannedResponse(dto);
  }

  @Patch("canned-responses/:id")
  @UseGuards(AdminPermissionGuard)
  @RequirePerm("support.manage")
  @Audit({
    action: "support.canned.update",
    targetType: "CannedResponse",
    targetParam: "id",
  })
  updateCannedResponse(
    @Param("id") id: string,
    @Body() dto: UpdateCannedResponseDto,
  ) {
    return this.support.updateCannedResponse(id, dto);
  }

  @Delete("canned-responses/:id")
  @HttpCode(200)
  @UseGuards(AdminPermissionGuard)
  @RequirePerm("support.manage")
  @Audit({
    action: "support.canned.delete",
    targetType: "CannedResponse",
    targetParam: "id",
  })
  deleteCannedResponse(@Param("id") id: string) {
    return this.support.deleteCannedResponse(id);
  }

  // ---- Knowledge base ----------------------------------------------------

  @Get("kb-articles")
  listArticles(@CurrentUser() user: AuthUser) {
    return this.support.listArticles(user);
  }

  // Web-facing aliases (`/support/kb`) for the knowledge base. Public so the
  // marketing-site Knowledge Base (and logged-out visitors) can browse before
  // signing up or opening a ticket. Only published articles are ever returned.
  @Public()
  @Get("kb")
  listKb(@CurrentUser() user: AuthUser | undefined) {
    return this.support.listArticles(user);
  }

  @Get("kb-articles/:slug")
  getArticle(@CurrentUser() user: AuthUser, @Param("slug") slug: string) {
    return this.support.getArticle(user, slug);
  }

  @Public()
  @Get("kb/:slug")
  getKbArticle(
    @CurrentUser() user: AuthUser | undefined,
    @Param("slug") slug: string,
  ) {
    return this.support.getArticle(user, slug);
  }

  @Post("kb-articles")
  @UseGuards(AdminPermissionGuard)
  @RequirePerm("support.manage")
  @Audit({ action: "support.kb.create", targetType: "KbArticle" })
  createArticle(@Body() dto: CreateKbArticleDto) {
    return this.support.createArticle(dto);
  }

  @Patch("kb-articles/:slug")
  @UseGuards(AdminPermissionGuard)
  @RequirePerm("support.manage")
  @Audit({
    action: "support.kb.update",
    targetType: "KbArticle",
    targetParam: "slug",
  })
  updateArticle(@Param("slug") slug: string, @Body() dto: UpdateKbArticleDto) {
    return this.support.updateArticle(slug, dto);
  }

  // ---- Categories --------------------------------------------------------

  @Get("categories")
  listCategories() {
    return this.support.listCategories();
  }

  @Post("categories")
  @UseGuards(AdminPermissionGuard)
  @RequirePerm("support.manage")
  @Audit({ action: "support.category.create", targetType: "TicketCategory" })
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.support.createCategory(dto);
  }

  @Patch("categories/:id")
  @UseGuards(AdminPermissionGuard)
  @RequirePerm("support.manage")
  @Audit({
    action: "support.category.update",
    targetType: "TicketCategory",
    targetParam: "id",
  })
  updateCategory(@Param("id") id: string, @Body() dto: UpdateCategoryDto) {
    return this.support.updateCategory(id, dto);
  }

  @Delete("categories/:id")
  @HttpCode(200)
  @UseGuards(AdminPermissionGuard)
  @RequirePerm("support.manage")
  @Audit({
    action: "support.category.delete",
    targetType: "TicketCategory",
    targetParam: "id",
  })
  deleteCategory(@Param("id") id: string) {
    return this.support.deleteCategory(id);
  }
}
