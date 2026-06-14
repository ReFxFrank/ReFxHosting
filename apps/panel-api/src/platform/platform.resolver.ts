import { UseGuards } from '@nestjs/common';
import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { GlobalAlert, Notification } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { AlertsService } from './alerts.service';
import { NotificationModel } from './models/notification.model';
import { GlobalAlertModel } from './models/global-alert.model';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';

/**
 * GraphQL surface for platform notifications and alerts. Both queries require an
 * authenticated principal (JwtAuthGuard).
 */
@Resolver()
@UseGuards(JwtAuthGuard)
export class PlatformResolver {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly alerts: AlertsService,
  ) {}

  /**
   * The authenticated caller's notifications (page slice, newest first).
   *
   * PaginationDto is a class-validator REST DTO, not a GraphQL @InputType, so we
   * accept the pagination fields as discrete scalar args and rebuild the DTO
   * (preserving its skip/take getters) before delegating to the service.
   */
  @Query(() => [NotificationModel], { name: 'myNotifications' })
  async myNotifications(
    @CurrentUser() principal: AuthUser,
    @Args('page', { type: () => Int, nullable: true, defaultValue: 1 })
    page: number,
    @Args('pageSize', { type: () => Int, nullable: true, defaultValue: 25 })
    pageSize: number,
  ): Promise<NotificationModel[]> {
    const pagination = new PaginationDto();
    pagination.page = page;
    pagination.pageSize = pageSize;

    const result = await this.notifications.listNotifications(
      principal.id,
      pagination,
    );
    return result.data.map(PlatformResolver.toNotificationModel);
  }

  /** Currently-active platform alerts (visible to any authenticated user). */
  @Query(() => [GlobalAlertModel], { name: 'activeAlerts' })
  async activeAlerts(): Promise<GlobalAlertModel[]> {
    const alerts = await this.alerts.listActiveAlerts();
    return alerts.map(PlatformResolver.toAlertModel);
  }

  private static toNotificationModel(n: Notification): NotificationModel {
    return {
      id: n.id,
      channel: n.channel,
      title: n.title,
      body: n.body,
      readAt: n.readAt,
      createdAt: n.createdAt,
    };
  }

  private static toAlertModel(a: GlobalAlert): GlobalAlertModel {
    return {
      id: a.id,
      severity: a.severity,
      title: a.title,
      body: a.body,
      isActive: a.isActive,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      createdAt: a.createdAt,
    };
  }
}
