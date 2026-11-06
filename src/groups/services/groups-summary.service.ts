import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { handleServiceError } from 'src/common/utils/database-errors';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ModerationAccessService } from 'src/moderation/services/moderation-access.service';
import { StorageService } from 'src/storage/services/storage.service';
import type { GroupRow, Membership } from '../shared/groups.types';
import { getGroupPhotoReviewStatus } from '../shared/groups.utils';

@Injectable()
export class GroupSummaryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ModerationAccessService) private readonly moderationAccess: ModerationAccessService,
    @Inject(StorageService) private readonly storage: StorageService | undefined,
  ) {}
  async getGroup(userId: string, groupId: string) {
    try {
      const group: GroupRow | null = await this.prisma.group.findUnique({
        where: { id: groupId },
        include: {
          photoAsset: { select: { status: true, publishedKey: true, blurhash: true } },
          _count: { select: { members: { where: { status: 'active' } } } },
        },
      });
      if (!group || group.moderationStatus !== 'visible') throw new NotFoundException('Group not found');
      if (await this.moderationAccess.areBlocked(userId, group.createdByUserId)) {
        throw new ForbiddenException('This group is unavailable');
      }
      const membership =
        (await this.prisma.groupMember.findUnique({
          where: { groupId_userId: { groupId, userId } },
          select: { role: true, status: true, notificationPreference: true, feedPreference: true },
        })) ?? null;
      return await this.toSummary(group, userId, true, membership);
    } catch (error) {
      handleServiceError(error);
    }
  }

  async toSummary(group: GroupRow, userId: string, includeUpdatedAt = false, membershipOverride?: Membership | null) {
    const membership = membershipOverride === undefined ? (group.members?.[0] ?? null) : membershipOverride;
    const isOwner = group.createdByUserId === userId;
    const photoReviewStatus = getGroupPhotoReviewStatus(group.photoAsset);
    const photoPreviewUrl =
      isOwner && group.photoAssetId && group.photoAsset?.status !== 'approved' && this.storage
        ? await this.storage.getOwnerModerationPreviewUrl(group.createdByUserId, group.photoAssetId)
        : null;
    const canManage =
      isOwner || (membership?.status === 'active' && (membership.role === 'owner' || membership.role === 'admin'));
    const pendingRequestCount =
      includeUpdatedAt && canManage
        ? await this.prisma.groupMember.count({ where: { groupId: group.id, status: 'pending' } })
        : 0;
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      sports: group.sports,
      privacy: group.privacy,
      locationName: group.locationName,
      createdAt: group.createdAt,
      ...(includeUpdatedAt ? { updatedAt: group.updatedAt } : {}),
      createdByUserId: group.createdByUserId,
      isOwner,
      memberCount: group._count?.members ?? 0,
      categoryTags: group.categoryTags ?? [],
      photoUrl:
        group.photoAsset?.status === 'approved' && group.photoAsset.publishedKey && this.storage
          ? this.storage.getPublicUrl(group.photoAsset.publishedKey)
          : null,
      photoPreviewUrl,
      photoBlurhash: photoReviewStatus ? (group.photoAsset?.blurhash ?? null) : null,
      photoReviewStatus,
      photoPending: photoReviewStatus !== null,
      currentMembership: membership
        ? {
            role: membership.role,
            status: membership.status,
            notificationPreference: membership.notificationPreference ?? 'all',
            feedPreference: membership.feedPreference ?? 'all',
          }
        : null,
      canManage,
      pendingRequestCount,
    };
  }
}
