import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { handleServiceError } from 'src/common/utils/database-errors';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ModerationAccessService } from 'src/moderation/services/moderation-access.service';
import { StorageService } from 'src/storage/services/storage.service';
import type { CreateGroupPostDto } from '../dto/groups-content.dto';
import type { GroupPostListItem, GroupPostQueryRow, Membership } from '../shared/groups.types';
import { createGroupPage, encodeGroupDateCursor } from '../shared/groups.pagination';
import type { GroupDateCursor, GroupPage } from '../shared/groups.pagination';
import { GroupsNotificationsService } from './groups-notifications.service';
import { getGroupPhotoReviewStatus } from '../shared/groups.utils';

@Injectable()
export class GroupsPostsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ModerationAccessService) private readonly moderationAccess: ModerationAccessService,
    @Inject(StorageService) private readonly storage: StorageService | undefined,
    @Inject(GroupsNotificationsService) private readonly groupNotificationsService: GroupsNotificationsService,
  ) {}
  getPosts(userId: string, groupId: string): Promise<GroupPostListItem[]>;
  getPosts(
    userId: string,
    groupId: string,
    pageSize: number,
    cursor?: GroupDateCursor,
    paginationRequested?: boolean,
  ): Promise<GroupPostListItem[] | GroupPage<GroupPostListItem>>;
  async getPosts(
    userId: string,
    groupId: string,
    pageSize = 100,
    cursor?: GroupDateCursor,
    paginationRequested = false,
  ): Promise<GroupPostListItem[] | GroupPage<GroupPostListItem>> {
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
      const page = paginationRequested
        ? createGroupPage(posts, pageSize, (lastPost) =>
            encodeGroupDateCursor({ date: new Date(lastPost.createdAt), id: lastPost.id }),
          )
        : undefined;
      const pagePosts = page?.items ?? posts;
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
        const photoReviewStatus = getGroupPhotoReviewStatus(post.photoAsset);
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
      if (!page) return items;
      return { ...page, items };
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
        await this.groupNotificationsService.notifyGroupMembers(transaction, {
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
}
