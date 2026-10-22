import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import {
  MANDATORY_NOTIFICATION_TYPES,
  NOTIFICATION_ERROR_MESSAGE,
  NOTIFICATION_PAGE_SIZE,
} from './notification.constants';
import { encodeNotificationCursor, parseNotificationCursor } from './notification.pagination';
import { PushTokenDto } from './push-token.dto';

@Injectable()
export class NotificationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(userId: string, takeInput?: string, cursorInput?: string) {
    const requested = takeInput === undefined ? NOTIFICATION_PAGE_SIZE.default : Number(takeInput);
    if (!Number.isInteger(requested) || requested < 1)
      throw new BadRequestException(NOTIFICATION_ERROR_MESSAGE.invalidPageSize);
    const take = Math.min(requested, NOTIFICATION_PAGE_SIZE.max);
    const cursor = parseNotificationCursor(cursorInput);
    const rows = await this.prisma.notification.findMany({
      where: {
        recipientUserId: userId,
        inApp: true,
        AND: [
          {
            OR: [
              { recipient: { profile: { inAppNotifications: true } } },
              { type: { in: [...MANDATORY_NOTIFICATION_TYPES] } },
            ],
          },
          ...(cursor
            ? [
                {
                  OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
                },
              ]
            : []),
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      select: {
        id: true,
        type: true,
        targetType: true,
        targetId: true,
        relatedId: true,
        actorName: true,
        actorSurname: true,
        actorProfilePhoto: true,
        content: true,
        createdAt: true,
        readAt: true,
      },
    });
    const hasMore = rows.length > take;
    const notifications = rows.slice(0, take);
    const last = notifications.at(-1);
    return {
      notifications,
      hasMore,
      nextCursor: hasMore && last ? encodeNotificationCursor({ createdAt: last.createdAt, id: last.id }) : null,
    };
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({
      where: {
        recipientUserId: userId,
        inApp: true,
        readAt: null,
        OR: [
          { recipient: { profile: { inAppNotifications: true } } },
          { type: { in: [...MANDATORY_NOTIFICATION_TYPES] } },
        ],
      },
    });
  }

  async markRead(userId: string, notificationId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, recipientUserId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const owned = await this.prisma.notification.findFirst({
        where: { id: notificationId, recipientUserId: userId },
        select: { id: true },
      });
      if (!owned) throw new NotFoundException(NOTIFICATION_ERROR_MESSAGE.notFound);
    }
    return { updated: result.count };
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        recipientUserId: userId,
        inApp: true,
        readAt: null,
        OR: [
          { recipient: { profile: { inAppNotifications: true } } },
          { type: { in: [...MANDATORY_NOTIFICATION_TYPES] } },
        ],
      },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async getPushTokenStatus(userId: string, deviceId: string) {
    this.assertDeviceId(deviceId);
    const token = await this.prisma.pushDeviceToken.findFirst({
      where: { userId, deviceId, active: true },
      select: { id: true },
    });
    return { enabled: Boolean(token) };
  }

  async registerPushToken(userId: string, deviceId: string, dto: PushTokenDto) {
    this.assertDeviceId(deviceId);
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.pushDeviceToken.updateMany({
        where: { userId, deviceId, active: true },
        data: { active: false, updatedAt: now },
      });
      const existingToken = await transaction.pushDeviceToken.findFirst({ where: { token: dto.token } });
      if (existingToken) {
        await transaction.pushDeviceToken.update({
          where: { id: existingToken.id },
          data: { userId, deviceId, platform: dto.platform, active: true, updatedAt: now },
        });
      } else {
        await transaction.pushDeviceToken.create({
          data: { userId, deviceId, token: dto.token, platform: dto.platform, active: true, updatedAt: now },
        });
      }
    });
    return { enabled: true };
  }

  async unregisterPushToken(userId: string, deviceId: string) {
    this.assertDeviceId(deviceId);
    const result = await this.prisma.pushDeviceToken.updateMany({
      where: { userId, deviceId, active: true },
      data: { active: false, updatedAt: new Date() },
    });
    return { enabled: false, updated: result.count };
  }

  private assertDeviceId(deviceId: string) {
    if (!deviceId || deviceId.length > 128) throw new BadRequestException(NOTIFICATION_ERROR_MESSAGE.invalidDeviceId);
  }
}
