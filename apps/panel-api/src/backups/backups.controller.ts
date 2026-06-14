import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BackupsService } from './backups.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateBackupDto } from './dto/backups.dto';

@ApiTags('backups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('servers/:id/backups')
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Get()
  @RequirePermissions('backup.read')
  list(@Param('id') id: string, @Query() pagination: PaginationDto) {
    return this.backups.list(id, pagination);
  }

  @Post()
  @RequirePermissions('backup.create')
  @Audit({ action: 'backup.create', targetType: 'Server', targetParam: 'id' })
  create(@Param('id') id: string, @Body() dto: CreateBackupDto) {
    return this.backups.create(id, dto);
  }

  @Delete(':backupId')
  @RequirePermissions('backup.delete')
  @Audit({ action: 'backup.delete', targetType: 'Server', targetParam: 'id' })
  remove(@Param('id') id: string, @Param('backupId') backupId: string) {
    return this.backups.remove(id, backupId);
  }

  @Post(':backupId/restore')
  @RequirePermissions('backup.restore')
  @Audit({ action: 'backup.restore', targetType: 'Server', targetParam: 'id' })
  restore(@Param('id') id: string, @Param('backupId') backupId: string) {
    return this.backups.restore(id, backupId);
  }

  @Get(':backupId/download')
  @RequirePermissions('backup.download')
  download(@Param('id') id: string, @Param('backupId') backupId: string) {
    return this.backups.downloadUrl(id, backupId);
  }
}
