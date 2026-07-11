import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import {
  ChmodDto,
  CompressDto,
  DecompressDto,
  DeleteFilesDto,
  MkdirDto,
  RenameFileDto,
  UploadUrlDto,
  WriteFileDto,
} from './dto/files.dto';

@ApiTags('files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('servers/:id/files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get('list')
  @RequirePermissions('files.read')
  list(@Param('id') id: string, @Query('path') path = '/') {
    return this.files.list(id, path);
  }

  @Get('contents')
  @RequirePermissions('files.read')
  contents(@Param('id') id: string, @Query('path') path: string) {
    return this.files.contents(id, path);
  }

  @Post('write')
  @RequirePermissions('files.write')
  @Audit({ action: 'files.write', targetType: 'Server', targetParam: 'id' })
  write(@Param('id') id: string, @Body() dto: WriteFileDto) {
    return this.files.write(id, dto);
  }

  @Post('delete')
  @RequirePermissions('files.delete')
  @Audit({ action: 'files.delete', targetType: 'Server', targetParam: 'id' })
  delete(@Param('id') id: string, @Body() dto: DeleteFilesDto) {
    return this.files.delete(id, dto);
  }

  @Post('rename')
  @RequirePermissions('files.write')
  rename(@Param('id') id: string, @Body() dto: RenameFileDto) {
    return this.files.rename(id, dto);
  }

  @Post('mkdir')
  @RequirePermissions('files.write')
  mkdir(@Param('id') id: string, @Body() dto: MkdirDto) {
    return this.files.mkdir(id, dto);
  }

  @Post('chmod')
  @RequirePermissions('files.write')
  chmod(@Param('id') id: string, @Body() dto: ChmodDto) {
    return this.files.chmod(id, dto);
  }

  @Post('compress')
  @RequirePermissions('files.archive')
  compress(@Param('id') id: string, @Body() dto: CompressDto) {
    return this.files.compress(id, dto);
  }

  @Post('decompress')
  @RequirePermissions('files.archive')
  decompress(@Param('id') id: string, @Body() dto: DecompressDto) {
    return this.files.decompress(id, dto);
  }

  @Get('download-url')
  @RequirePermissions('files.read')
  downloadUrl(@Param('id') id: string, @Query('path') path: string) {
    return this.files.downloadUrl(id, path);
  }

  // Browser download target. @Public because a new tab can't send the JWT —
  // access is authorized by the short-lived HMAC minted by download-url (which
  // DID enforce files.read). Streams straight from the agent.
  @Public()
  @Get('download')
  async download(
    @Param('id') id: string,
    @Query('path') path: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const dl = await this.files.openSignedDownload(
      id,
      path,
      exp,
      sig,
      req.headers.range,
    );
    // Range/length passthrough -> resumable downloads with real progress.
    res.status(dl.status);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Accept-Ranges', dl.acceptRanges ?? 'bytes');
    if (dl.contentRange) res.setHeader('Content-Range', dl.contentRange);
    if (dl.contentLength) res.setHeader('Content-Length', dl.contentLength);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${dl.filename.replace(/[^\w.\- ]/g, '_')}"`,
    );
    Readable.fromWeb(dl.stream as never).pipe(res);
  }

  @Post('upload-url')
  @RequirePermissions('files.write')
  uploadUrl(@Param('id') id: string, @Body() dto: UploadUrlDto) {
    return this.files.uploadUrl(id, dto.path);
  }

  // Direct upload: the raw request body (registered as a binary body parser in
  // main.ts) is the file's bytes; `path` is the absolute destination inside the
  // server's jail (e.g. /mods/Foo.jar).
  @Post('upload')
  @RequirePermissions('files.write')
  @Audit({ action: 'files.upload', targetType: 'Server', targetParam: 'id' })
  upload(
    @Param('id') id: string,
    @Query('path') path: string,
    @Req() req: Request,
  ) {
    return this.files.upload(id, path, req.body as Buffer);
  }
}
