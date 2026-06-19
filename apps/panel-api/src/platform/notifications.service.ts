import { Injectable, NotFoundException } from '@nestjs/common';
import { Notification, NotificationChannel, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Paginated, PaginationDto, paginate } from '../common/dto/pagination.dto';
import { uuidv7 } from '../common/util/uuid';
import { CreateNotificationDto } from './dto/create-notification.dto';

/**
 * In-app notification store. Exported so other feature modules (billing,
 * provisioning, support, ...) can enqueue notifications for a user.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a notification for a user. For EMAIL-channel notifications the row is
   * still persisted (acting as a delivery record); actual sending is handled out
   * of band.
   */
  async createNotification(
    userId: string,
    dto: CreateNotificationDto,
  ): Promise<Notification> {
    const channel = dto.channel ?? NotificationChannel.IN_APP;

    const notification = await this.prisma.notification.create({
      data: {
        id: uuidv7(),
        userId,
        channel,
        title: dto.title,
        body: dto.body,
      },
    });

    if (channel === NotificationChannel.EMAIL) {
      // TODO(impl): hand off to the email delivery provider (queue + template).
    }

    return notification;
  }

  /** Paginated listing of a user's notifications, newest first. */
  async listNotifications(
    userId: string,
    pagination: PaginationDto,
  ): Promise<Paginated<Notification>> {
    const where: Prisma.NotificationWhereInput = { userId };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return paginate(data, total, {
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
  }

  /** Mark a single notification (owned by the user) as read. Idempotent. */
  async markRead(userId: string, id: string): Promise<Notification> {
    // Scope the update to the owner so users can't touch others' rows.
    const result = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });

    if (result.count === 0) {
      // Either it doesn't exist / isn't owned, or it was already read. Fetch to
      // distinguish "already read" (return it) from "not found" (throw).
      const existing = await this.prisma.notification.findFirst({
        where: { id, userId },
      });
      if (!existing) throw new NotFoundException('Notification not found');
      return existing;
    }

    const updated = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!updated) throw new NotFoundException('Notification not found');
    return updated;
  }

  /** Mark all of a user's unread notifications as read. Returns the count. */
  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  /** Number of unread notifications for the user. */
  async unreadCount(userId: string): Promise<{ unread: number }> {
    const unread = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { unread };
  }

  /** Delete a single notification owned by the user. Idempotent. */
  async deleteNotification(
    userId: string,
    id: string,
  ): Promise<{ deleted: number }> {
    const result = await this.prisma.notification.deleteMany({
      where: { id, userId },
    });
    return { deleted: result.count };
  }

  /** Clear (delete) all of a user's notifications. Returns the count removed. */
  async clearAll(userId: string): Promise<{ deleted: number }> {
    const result = await this.prisma.notification.deleteMany({
      where: { userId },
    });
    return { deleted: result.count };
  }

  /**
   * Best-effort fan-out: create the same notification for several users. Used for
   * events with multiple recipients (e.g. an unassigned ticket reply -> all
   * staff). Never throws — notification delivery must not break the caller.
   */
  async notifyMany(
    userIds: string[],
    dto: CreateNotificationDto,
  ): Promise<void> {
    const unique = [...new Set(userIds)].filter(Boolean);
    await Promise.all(
      unique.map((userId) =>
        this.createNotification(userId, dto).catch(() => undefined),
      ),
    );
  }
}
