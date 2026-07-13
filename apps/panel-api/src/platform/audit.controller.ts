import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { RequirePerm } from '../common/decorators/require-permission.decorator';
import { AuditQueryDto } from './dto/audit-query.dto';

/**
 * Admin-only audit log browser. Read-only: audit entries are written by the
 * AuditInterceptor, never via this controller.
 */
@ApiTags('platform')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminPermissionGuard)
@Controller('platform/audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePerm('audit.read')
  list(@Query() filter: AuditQueryDto) {
    return this.audit.listAuditLogs(filter);
  }
}
