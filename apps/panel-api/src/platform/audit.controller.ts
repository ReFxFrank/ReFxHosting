import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GlobalRole } from '@prisma/client';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditQueryDto } from './dto/audit-query.dto';

/**
 * Admin-only audit log browser. Read-only: audit entries are written by the
 * AuditInterceptor, never via this controller.
 */
@ApiTags('platform')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(GlobalRole.ADMIN)
@Controller('platform/audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query() filter: AuditQueryDto) {
    return this.audit.listAuditLogs(filter);
  }
}
