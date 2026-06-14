import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SftpService } from './sftp.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Audit } from '../common/decorators/audit.decorator';

@ApiTags('sftp')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('servers/:id/sftp')
export class SftpController {
  constructor(private readonly sftp: SftpService) {}

  @Get()
  @RequirePermissions('files.sftp')
  details(@Param('id') id: string) {
    return this.sftp.details(id);
  }

  @Post('rotate')
  @RequirePermissions('files.sftp')
  @Audit({ action: 'sftp.rotate', targetType: 'Server', targetParam: 'id' })
  rotate(@Param('id') id: string) {
    return this.sftp.rotate(id);
  }
}
