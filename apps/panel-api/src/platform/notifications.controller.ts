import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateNotificationDto } from './dto/create-notification.dto';

/**
 * Self-service notification inbox for the authenticated user. All routes are
 * scoped to the caller; there is no cross-user access here.
 */
@ApiTags('platform')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('platform/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser('id') userId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.notifications.listNotifications(userId, pagination);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser('id') userId: string) {
    return this.notifications.unreadCount(userId);
  }

  /**
   * Self-create a notification (e.g. test / dev convenience). Notifications for
   * other users are produced internally via NotificationsService injection.
   */
  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateNotificationDto,
  ) {
    return this.notifications.createNotification(userId, dto);
  }

  @Post('read-all')
  @HttpCode(200)
  markAllRead(@CurrentUser('id') userId: string) {
    return this.notifications.markAllRead(userId);
  }

  @Post(':id/read')
  @HttpCode(200)
  markRead(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.notifications.markRead(userId, id);
  }
}
