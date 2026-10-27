import { Inject, Injectable, Optional } from '@nestjs/common';
import { ModerationAccessService } from 'src/moderation/moderation-access.service';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { StorageService } from 'src/storage/services/storage.service';
import { handleServiceError } from 'src/common/utils/database-errors';
import { Filtering } from './filter.decorator';
import { encodeProfileCursor, type ProfileCursor } from './account.pagination';
import { DEFAULT_PROFILE_PAGE_SIZE, PROFILE_SEARCH_SELECT } from './const';
import { buildProfileWhere } from './utils';
import type { ProfilePhotoModerationAsset, ProfileSearchProfile } from './account.types';

@Injectable()
export class AccountService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(ModerationAccessService) moderationAccess?: ModerationAccessService,
    @Optional() @Inject(StorageService) private readonly storageService?: StorageService,
  ) {
    this.moderationAccess = moderationAccess ?? new ModerationAccessService(this.prisma);
  }

  private readonly moderationAccess: ModerationAccessService;

  async getFilteredAccounts(
    take = String(DEFAULT_PROFILE_PAGE_SIZE),
    cursor: ProfileCursor | undefined,
    filter: Filtering,
    currentUserId?: string,
  ) {
    const filterWhere = buildProfileWhere(filter);
    const visibilityWhere = currentUserId
      ? { OR: [{ profileSearchVisible: true }, { userId: currentUserId }] }
      : { profileSearchVisible: true };
    const blockedUserIds = currentUserId ? await this.moderationAccess.blockedUserIds(currentUserId) : [];
    const where = {
      AND: [
        filterWhere,
        visibilityWhere,
        ...(blockedUserIds.length ? [{ userId: { notIn: blockedUserIds } }] : []),
        ...(cursor ? [{ id: { gt: cursor.id } }] : []),
      ],
    };

    try {
      const profilesWithExtraItem = (await this.prisma.profile.findMany({
        where,
        orderBy: { id: 'asc' },
        take: Number(take) + 1,
        select: PROFILE_SEARCH_SELECT,
      })) as ProfileSearchProfile[];
      const hasMore = profilesWithExtraItem.length > Number(take);
      const profiles = profilesWithExtraItem.slice(0, Number(take));
      const pendingAssetIds = profiles.flatMap((profile) =>
        typeof profile.profilePhotoPendingAssetId === 'string' ? [profile.profilePhotoPendingAssetId] : [],
      );
      const moderationAssets = (
        pendingAssetIds.length
          ? await this.prisma.mediaModerationAsset.findMany({
              where: {
                id: { in: pendingAssetIds },
                ownerId: { in: profiles.map(({ userId }) => userId) },
                role: 'media',
                scope: 'profile',
              },
              select: { id: true, ownerId: true, status: true, publishedKey: true },
            })
          : []
      ) as ProfilePhotoModerationAsset[];
      const assetsById = new Map(moderationAssets.map((asset) => [asset.id, asset]));
      const items = profiles.map(({ profilePhotoPendingAssetId, profilePhotoPendingBlurhash, ...profile }) => {
        const asset = profilePhotoPendingAssetId ? assetsById.get(profilePhotoPendingAssetId) : undefined;
        if (
          asset &&
          asset.ownerId === profile.userId &&
          asset.status === 'approved' &&
          asset.publishedKey &&
          this.storageService
        ) {
          return {
            ...profile,
            profilePhoto: this.storageService.getPublicUrl(asset.publishedKey),
            profilePhotoBlurhash: profilePhotoPendingBlurhash ?? profile.profilePhotoBlurhash,
          };
        }
        if (
          asset &&
          asset.ownerId === profile.userId &&
          (asset.status === 'queued' || asset.status === 'processing' || asset.status === 'review_required')
        ) {
          const hasPublishedPhoto = Boolean(profile.profilePhoto);
          return {
            ...profile,
            profilePhotoBlurhash: hasPublishedPhoto ? profile.profilePhotoBlurhash : profilePhotoPendingBlurhash,
            ...(!hasPublishedPhoto ? { profilePhotoReviewStatus: asset.status } : {}),
          };
        }
        return profile;
      });

      return {
        items,
        hasMore,
        nextCursor: hasMore && profiles.length ? encodeProfileCursor(profiles.at(-1)!) : null,
      };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getAccountByUserId(id: string) {
    try {
      return await this.prisma.profile.findUnique({ where: { userId: id } });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getOrCreateAccountByUserId(id: string) {
    try {
      return await this.prisma.profile.upsert({
        where: { userId: id },
        update: {},
        create: { userId: id },
      });
    } catch (error) {
      handleServiceError(error);
    }
  }
}
