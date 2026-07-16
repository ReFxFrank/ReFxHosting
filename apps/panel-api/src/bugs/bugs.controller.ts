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
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { BugsService } from './bugs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { RequirePerm } from '../common/decorators/require-permission.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { CreateBugReportDto } from './dto/create-bug-report.dto';
import { UpdateBugReportDto } from './dto/update-bug-report.dto';
import { AddBugCommentDto } from './dto/add-bug-comment.dto';
import { ListBugReportsQueryDto } from './dto/list-bug-reports-query.dto';

/**
 * Bug reports. All routes require auth (class guard). Customer routes have no
 * extra guard — the service scopes them to the caller — while staff-only triage
 * routes add AdminPermissionGuard + @RequirePerm('bugs.*').
 */
@ApiTags('bugs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bugs')
export class BugsController {
  constructor(private readonly bugs: BugsService) {}

  // ---- customer / shared -------------------------------------------------

  /** Submit a bug (customers + staff). Rate-limited to curb spam. */
  @Post()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Audit({ action: 'bug.create', targetType: 'BugReport' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBugReportDto) {
    return this.bugs.create(user, dto);
  }

  /** List: customers see their own; staff see all (or ?mine=true). */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListBugReportsQueryDto) {
    return this.bugs.list(user, query);
  }

  /** Staff assignee picker. */
  @Get('staff')
  @UseGuards(AdminPermissionGuard)
  @RequirePerm('bugs.read')
  listStaff() {
    return this.bugs.listStaff();
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bugs.get(user, id);
  }

  @Post(':id/comments')
  @Audit({ action: 'bug.comment', targetType: 'BugReport', targetParam: 'id' })
  addComment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddBugCommentDto,
  ) {
    return this.bugs.addComment(user, id, dto);
  }

  /** Upload a screenshot (raw image bytes; see main.ts raw() registration). */
  @Post(':id/attachments')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Audit({ action: 'bug.attach', targetType: 'BugReport', targetParam: 'id' })
  addAttachment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const body = req.body as unknown;
    const buf = Buffer.isBuffer(body) ? body : Buffer.alloc(0);
    const fileName = decodeURIComponent(
      (req.headers['x-file-name'] as string) || 'screenshot',
    );
    const contentType =
      (req.headers['content-type'] as string) || 'application/octet-stream';
    return this.bugs.addAttachment(user, id, fileName, contentType, buf);
  }

  /** Download an attachment's bytes (reporter or staff). */
  @Get(':id/attachments/:attachmentId')
  async downloadAttachment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const att = await this.bugs.getAttachment(user, id, attachmentId);
    res.setHeader('Content-Type', att.contentType);
    res.setHeader('Content-Length', att.data.length);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${att.fileName.replace(/"/g, '')}"`,
    );
    res.end(att.data);
  }

  // ---- staff triage ------------------------------------------------------

  @Patch(':id')
  @UseGuards(AdminPermissionGuard)
  @RequirePerm('bugs.manage')
  @Audit({ action: 'bug.update', targetType: 'BugReport', targetParam: 'id' })
  update(@Param('id') id: string, @Body() dto: UpdateBugReportDto) {
    return this.bugs.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminPermissionGuard)
  @RequirePerm('bugs.manage')
  @HttpCode(204)
  @Audit({ action: 'bug.delete', targetType: 'BugReport', targetParam: 'id' })
  delete(@Param('id') id: string) {
    return this.bugs.delete(id);
  }
}
