import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { RequirePerm } from '../common/decorators/require-permission.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { CreateAlertDto } from './dto/create-alert.dto';

/**
 * Platform alerts. Reading active alerts is available to any authenticated user;
 * mutations require ADMIN.
 */
@ApiTags('platform')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('platform/alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  listActive() {
    return this.alerts.listActiveAlerts();
  }

  @Post()
  @UseGuards(AdminPermissionGuard)
  @RequirePerm('content.manage')
  @Audit({ action: 'platform.alert.create', targetType: 'GlobalAlert' })
  create(@Body() dto: CreateAlertDto) {
    return this.alerts.createAlert(dto);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @UseGuards(AdminPermissionGuard)
  @RequirePerm('content.manage')
  @Audit({
    action: 'platform.alert.deactivate',
    targetType: 'GlobalAlert',
    targetParam: 'id',
  })
  deactivate(@Param('id') id: string) {
    return this.alerts.deactivateAlert(id);
  }
}
