import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { handleServiceError } from 'src/common/utils/database-errors';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ModerationAccessService } from 'src/moderation/moderation-access.service';
import { StorageService } from 'src/storage/services/storage.service';
import { createNotificationEvent } from 'src/notification/notification-event';
import { NOTIFICATION_TYPE } from 'src/notification/notification.constants';
import type { CreateGroupEventDto, CreateGroupPostDto } from './groups.dto';
import type { GroupEventListItem, GroupPhotoReviewStatus, GroupPostQueryRow, Membership } from './groups.types';
import { encodeGroupDateCursor } from './groups.pagination';
import type { GroupDateCursor } from './groups.pagination';

@Injectable()
export class GroupsContentService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ModerationAccessService) private readonly moderationAccess: ModerationAccessService,
    @Inject(StorageService) private readonly storage?: StorageService,
  ) {}

  async getPosts(
    userId: string,
    groupId: string,
    pageSize = 100,
    cursor?: GroupDateCursor,
    paginationRequested = false,
  ) {
    try {
      const group: {
        privacy: 'open' | 'closed';
        createdByUserId: string;
        members: Array<{ status: string; feedPreference: 'all' | 'admins' }>;
      } | null = await this.prisma.group.findUnique({
        where: { id: groupId },
        select: {
          privacy: true,
          createdByUserId: true,
          members: { where: { userId }, select: { status: true, feedPreference: true } },
        },
      });
      if (!group) throw new NotFoundException('Group not found');
      const membership = group.members[0];
      const isOwner = group.createdByUserId === userId;
      if (group.privacy === 'closed' && membership?.status !== 'active' && !isOwner) {
        throw new ForbiddenException('Join this group to view its posts');
      }

      const blockedIds = await this.moderationAccess.blockedUserIds(userId);
      const where: Record<string, unknown> = {
        groupId,
        ...(blockedIds.length ? { createdByUserId: { notIn: blockedIds } } : {}),
      };
      if (membership?.status === 'active' && membership.feedPreference === 'admins') {
        const admins: Array<{ userId: string }> = await this.prisma.groupMember.findMany({
          where: { groupId, status: 'active', role: { in: ['owner', 'admin'] } },
          select: { userId: true },
        });
        const adminIds = admins
          .map(({ userId: adminId }) => adminId)
          .filter((adminId) => !blockedIds.includes(adminId));
        if (!adminIds.length) {
          return paginationRequested ? { items: [], hasMore: false, nextCursor: null } : [];
        }
        where.createdByUserId = { in: adminIds };
      }
      if (paginationRequested && cursor) {
        where.AND = [
          {
            OR: [{ createdAt: { lt: cursor.date } }, { createdAt: cursor.date, id: { lt: cursor.id } }],
          },
        ];
      }

      const posts: GroupPostQueryRow[] = await this.prisma.groupPost.findMany({
        where,
        include: {
          author: {
            include: {
              profile: { select: { name: true, surname: true, profilePhoto: true, hideProfilePhotos: true } },
            },
          },
          photoAsset: { select: { status: true, publishedKey: true, blurhash: true } },
        },
        orderBy: paginationRequested ? [{ createdAt: 'desc' }, { id: 'desc' }] : { createdAt: 'desc' },
        take: paginationRequested ? pageSize + 1 : 50,
      });
      const hasMore = paginationRequested && posts.length > pageSize;
      const pagePosts = paginationRequested ? posts.slice(0, pageSize) : posts;
      const ownerPreviewAssetIds = pagePosts
        .filter(
          (post) =>
            post.createdByUserId === userId &&
            post.photoAssetId &&
            post.photoAsset?.status !== 'approved' &&
            post.photoAsset?.status !== 'rejected',
        )
        .map(({ photoAssetId }) => photoAssetId);
      const ownerPreviewUrls: Record<string, string> =
        this.storage && ownerPreviewAssetIds.length
          ? await this.storage
              .getOwnerModerationPreviewUrls(userId, ownerPreviewAssetIds)
              .catch((): Record<string, string> => ({}))
          : {};
      const items = pagePosts.map((post) => {
        const photoStatus = post.photoAsset?.status;
        const photoReviewStatus: GroupPhotoReviewStatus =
          photoStatus === 'queued' ||
          photoStatus === 'processing' ||
          photoStatus === 'review_required' ||
          (photoStatus === 'approved' && !post.photoAsset?.publishedKey)
            ? photoStatus
            : null;
        return {
          id: post.id,
          text: post.text,
          createdAt: post.createdAt,
          ...(post.photoAssetId
            ? {
                hasPhoto: true,
                photoPending: photoReviewStatus !== null,
                photoBlurhash: photoReviewStatus ? (post.photoAsset?.blurhash ?? null) : null,
                photoReviewStatus,
                photoPreviewUrl: ownerPreviewUrls[post.photoAssetId] ?? null,
              }
            : {}),
          author: post.author?.profile
            ? {
                userId: post.author.id,
                name: [post.author.profile.name, post.author.profile.surname].filter(Boolean).join(' ') || null,
                profilePhoto: post.author.profile.hideProfilePhotos ? null : post.author.profile.profilePhoto,
              }
            : null,
          photoUrl:
            post.photoAsset?.status === 'approved' && post.photoAsset.publishedKey && this.storage
              ? this.storage.getPublicUrl(post.photoAsset.publishedKey)
              : null,
        };
      });
      if (!paginationRequested) return items;
      const lastPost = pagePosts.at(-1);
      return {
        items,
        hasMore,
        nextCursor:
          hasMore && lastPost ? encodeGroupDateCursor({ date: new Date(lastPost.createdAt), id: lastPost.id }) : null,
      };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async createPost(userId: string, groupId: string, body: CreateGroupPostDto) {
    try {
      const group: { name: string; createdByUserId: string } | null = await this.prisma.group.findUnique({
        where: { id: groupId },
        select: { name: true, createdByUserId: true },
      });
      if (!group) throw new NotFoundException('Group not found');
      const membership: Membership | null = await this.prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
        select: { role: true, status: true },
      });
      if (group.createdByUserId !== userId && membership?.status !== 'active') {
        throw new ForbiddenException('Only active group members can publish posts');
      }
      const text = body.text.trim();
      if (!text) throw new BadRequestException('Post text is required');
      if (body.photoAssetId) {
        const photo = await this.prisma.mediaModerationAsset.findFirst({
          where: { id: body.photoAssetId, ownerId: userId, scope: 'group', role: 'media' },
          select: { status: true, contentType: true },
        });
        if (!photo || !photo.contentType.startsWith('image/') || ['failed', 'rejected'].includes(photo.status)) {
          throw new BadRequestException('Group post photo upload is not available');
        }
      }
      return await this.prisma.$transaction(async (transaction) => {
        const post = await transaction.groupPost.create({
          data: { groupId, createdByUserId: userId, text, photoAssetId: body.photoAssetId ?? null },
        });
        await this.notifyGroupMembers(transaction, {
          groupId,
          groupName: group.name,
          sourceId: post.id,
          actorUserId: userId,
          isAnnouncement:
            group.createdByUserId === userId || membership?.role === 'admin' || membership?.role === 'owner',
          kind: 'post',
          content: text,
        });
        return post;
      });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getEvents(
    userId: string,
    groupId: string,
    period: 'upcoming' | 'past' = 'upcoming',
    pageSize = 100,
    cursor?: GroupDateCursor,
    paginationRequested = false,
  ) {
    try {
      const group: {
        privacy: 'open' | 'closed';
        createdByUserId: string;
        members: Array<{ status: string }>;
      } | null = await this.prisma.group.findUnique({
        where: { id: groupId },
        select: {
          privacy: true,
          createdByUserId: true,
          members: { where: { userId }, select: { status: true } },
        },
      });
      if (!group) throw new NotFoundException('Group not found');
      if (group.privacy === 'closed' && group.members[0]?.status !== 'active' && group.createdByUserId !== userId) {
        throw new ForbiddenException('Join this group to view its events');
      }
      const now = new Date();
      const cursorDateCondition = cursor
        ? {
            OR:
              period === 'upcoming'
                ? [{ startsAt: { gt: cursor.date } }, { startsAt: cursor.date, id: { gt: cursor.id } }]
                : [{ startsAt: { lt: cursor.date } }, { startsAt: cursor.date, id: { lt: cursor.id } }],
          }
        : undefined;
      const events: GroupEventListItem[] = await this.prisma.groupEvent.findMany({
        where: {
          groupId,
          startsAt: period === 'upcoming' ? { gte: now } : { lt: now },
          ...(paginationRequested && cursorDateCondition ? { AND: [cursorDateCondition] } : {}),
        },
        orderBy: period === 'upcoming' ? [{ startsAt: 'asc' }, { id: 'asc' }] : [{ startsAt: 'desc' }, { id: 'desc' }],
        take: paginationRequested ? pageSize + 1 : 100,
      });
      if (!paginationRequested) return events;
      const hasMore = events.length > pageSize;
      const items = events.slice(0, pageSize);
      const lastEvent = items.at(-1);
      return {
        items,
        hasMore,
        nextCursor:
          hasMore && lastEvent ? encodeGroupDateCursor({ date: new Date(lastEvent.startsAt), id: lastEvent.id }) : null,
      };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async createEvent(userId: string, groupId: string, body: CreateGroupEventDto) {
    try {
      const group: { name: string; createdByUserId: string; sports: string[] } | null =
        await this.prisma.group.findUnique({
          where: { id: groupId },
          select: { name: true, createdByUserId: true, sports: true },
        });
      if (!group) throw new NotFoundException('Group not found');
      const actor: Membership | null = await this.prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
        select: { role: true, status: true },
      });
      const hasManageRole = actor?.status === 'active' && (actor.role === 'owner' || actor.role === 'admin');
      if (group.createdByUserId !== userId && !hasManageRole) {
        throw new ForbiddenException('Only group admins can create events');
      }
      if (body.sport && !group.sports.includes(body.sport)) {
        throw new BadRequestException('Event activity must match one of the group activities');
      }
      const startsAt = new Date(body.startsAt);
      if (startsAt.getTime() <= Date.now())
        throw new BadRequestException('Group events must be scheduled in the future');
      return await this.prisma.$transaction(async (transaction) => {
        const event = await transaction.groupEvent.create({
          data: {
            groupId,
            createdByUserId: userId,
            title: body.title.trim(),
            description: body.description?.trim() || null,
            locationName: body.locationName?.trim() || null,
            sport: body.sport ?? group.sports[0] ?? null,
            distanceKm: body.distanceKm ?? null,
            startsAt,
          },
        });
        await this.notifyGroupMembers(transaction, {
          groupId,
          groupName: group.name,
          sourceId: event.id,
          actorUserId: userId,
          isAnnouncement: true,
          kind: 'event',
          content: [event.title, event.distanceKm ? `${event.distanceKm} km` : null, event.locationName]
            .filter(Boolean)
            .join(' · '),
        });
        return event;
      });
    } catch (error) {
      handleServiceError(error);
    }
  }

  private async notifyGroupMembers(
    transaction: PrismaService,
    notification: {
      groupId: string;
      groupName: string;
      sourceId: string;
      actorUserId: string;
      isAnnouncement: boolean;
      kind: 'post' | 'event';
      content: string;
    },
  ) {
    const recipients: Array<{ userId: string; notificationPreference: 'all' | 'announcements' | 'off' }> =
      await transaction.groupMember.findMany({
        where: { groupId: notification.groupId, status: 'active', userId: { not: notification.actorUserId } },
        select: { userId: true, notificationPreference: true },
      });
    if (!recipients.length) return;

    const actor = await transaction.profile.findUnique({
      where: { userId: notification.actorUserId },
      select: { name: true, surname: true, profilePhoto: true, hideProfilePhotos: true },
    });
    const isPost = notification.kind === 'post';
    const eventType = isPost ? NOTIFICATION_TYPE.groupPost : NOTIFICATION_TYPE.groupEvent;
    const categoryPreference = isPost ? 'groupPostsNotifications' : 'groupEventsNotifications';
    const localizedContent = isPost
      ? {
          russian: `Новая запись в группе «${notification.groupName}»: ${notification.content}`,
          english: `New post in “${notification.groupName}”: ${notification.content}`,
        }
      : {
          russian: `Новое событие в группе «${notification.groupName}»: ${notification.content}`,
          english: `New event in “${notification.groupName}”: ${notification.content}`,
        };

    for (const { userId, notificationPreference } of recipients) {
      if (
        notificationPreference === 'off' ||
        (notificationPreference === 'announcements' && !notification.isAnnouncement)
      ) {
        continue;
      }
      await createNotificationEvent(transaction, {
        recipientUserId: userId,
        actorUserId: notification.actorUserId,
        type: eventType,
        sourceId: notification.sourceId,
        targetType: isPost ? 'group-post' : 'group-event',
        targetId: notification.groupId,
        relatedId: notification.sourceId,
        actorName: actor?.name,
        actorSurname: actor?.surname,
        actorProfilePhoto: actor?.hideProfilePhotos ? null : actor?.profilePhoto,
        localizedContent,
        categoryPreference,
      });
    }
  }
}
