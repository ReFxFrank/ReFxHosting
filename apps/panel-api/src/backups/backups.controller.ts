import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Readable } from 'node:stream';
import type { Request, Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BackupsService } from './backups.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateBackupDto, UpdateBackupDto } from './dto/backups.dto';

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

  // Lock/unlock. Gated on backup.delete because locking exists purely to
  // control deletability — whoever may delete may also protect.
  @Patch(':backupId')
  @RequirePermissions('backup.delete')
  @Audit({ action: 'backup.lock', targetType: 'Server', targetParam: 'id' })
  update(
    @Param('id') id: string,
    @Param('backupId') backupId: string,
    @Body() dto: UpdateBackupDto,
  ) {
    return this.backups.setLocked(id, backupId, dto.isLocked);
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

  // Browser download target. @Public because a new tab can't send the JWT —
  // access is authorized by the short-lived HMAC minted by /download (which
  // DID enforce backup.download). Streams the archive from the agent.
  @Public()
  @Get(':backupId/archive')
  async archive(
    @Param('id') id: string,
    @Param('backupId') backupId: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const dl = await this.backups.openSignedDownload(
      id,
      backupId,
      exp,
      sig,
      req.headers.range,
    );
    // Pass the agent's range semantics through so browsers can resume and
    // show real progress. Fall back to the recorded archive size when a
    // legacy agent didn't send a length.
    res.status(dl.status);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Accept-Ranges', dl.acceptRanges ?? 'bytes');
    if (dl.contentRange) res.setHeader('Content-Range', dl.contentRange);
    const length =
      dl.contentLength ??
      (dl.status === 200 && dl.sizeBytes > 0n ? String(dl.sizeBytes) : undefined);
    if (length) res.setHeader('Content-Length', length);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${dl.filename.replace(/[^\w.\- ]/g, '_')}"`,
    );
    Readable.fromWeb(dl.stream as never).pipe(res);
  }
}
