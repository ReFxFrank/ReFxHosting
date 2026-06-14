import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DatabasesService } from './databases.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { CreateDatabaseDto } from './dto/databases.dto';

@ApiTags('databases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('servers/:id/databases')
export class DatabasesController {
  constructor(private readonly databases: DatabasesService) {}

  @Get()
  @RequirePermissions('database.read')
  list(@Param('id') id: string) {
    return this.databases.list(id);
  }

  @Post()
  @RequirePermissions('database.create')
  @Audit({ action: 'database.create', targetType: 'Server', targetParam: 'id' })
  create(@Param('id') id: string, @Body() dto: CreateDatabaseDto) {
    return this.databases.create(id, dto);
  }

  @Delete(':dbId')
  @RequirePermissions('database.delete')
  @Audit({ action: 'database.delete', targetType: 'Server', targetParam: 'id' })
  remove(@Param('id') id: string, @Param('dbId') dbId: string) {
    return this.databases.remove(id, dbId);
  }

  @Post(':dbId/rotate')
  @RequirePermissions('database.create')
  @Audit({ action: 'database.rotate', targetType: 'Server', targetParam: 'id' })
  rotate(@Param('id') id: string, @Param('dbId') dbId: string) {
    return this.databases.rotate(id, dbId);
  }
}
