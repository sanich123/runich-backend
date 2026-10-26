import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { LatencyMetricsService } from 'src/common/metrics/latency-metrics.service';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { handleServiceError } from 'src/common/utils/database-errors';
import { UserDto } from './user.dto';
import { blurhashFromUrl } from 'src/common/images/blurhash';
import { StorageService } from 'src/storage/services/storage.service';
import { PUBLIC_USER_PROFILE_SELECT } from 'src/account/const';
import { ModerationAccessService } from 'src/moderation/moderation-access.service';
import type { ProfilePhotoReviewStage, ProfileWithPendingPhoto } from './user.types';

@Injectable()
export class UserService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(LatencyMetricsService) private readonly latencyMetrics?: LatencyMetricsService,
    @Optional() @Inject(StorageService) private readonly storageService?: StorageService,
    @Optional() @Inject(ModerationAccessService) moderationAccess?: ModerationAccessService,
  ) {
    this.moderationAccess = moderationAccess ?? new ModerationAccessService(this.prisma);
  }

  private readonly moderationAccess: ModerationAccessService;

  async getProfileByUserId(userId: string, currentUserId = userId) {
    try {
      if (userId !== currentUserId) {
        if (await this.moderationAccess.areBlocked(userId, currentUserId)) return null;
        const profile = await this.prisma.profile.findUnique({
          where: { userId },
          select: {
            ...PUBLIC_USER_PROFILE_SELECT,
            profilePhotoPendingAssetId: true,
            profilePhotoPendingBlurhash: true,
          },
        });
        return profile ? await this.presentProfilePhoto(profile, false) : profile;
      }
      const profile = await this.prisma.profile.findUnique({ where: { userId } });
      return profile ? await this.presentProfilePhoto(profile, true) : profile;
    } catch (error) {
      handleServiceError(error);
    }
  }

  async createProfileByUserId(id: string, currentUserId: string | UserDto, accountDto?: UserDto) {
    try {
      if (!accountDto) {
        accountDto = currentUserId as UserDto;
        currentUserId = id;
      }
      if (id !== currentUserId) throw new ForbiddenException('Недостаточно прав');
      const profilePhoto = await this.promoteProfilePhoto(id, accountDto.profilePhoto);
      const profilePhotoBlurhash = profilePhoto ? await blurhashFromUrl(profilePhoto, this.latencyMetrics) : null;
      return await this.prisma.profile.create({
        data: { ...this.withoutProfilePhotoAssetId(accountDto), profilePhoto, profilePhotoBlurhash, userId: id },
      });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async updateProfileByProfileId(profileId: string, currentUserId: string | UserDto, accountDto?: UserDto) {
    try {
      const hasImplicitOwner = !accountDto;
      if (!accountDto) {
        accountDto = currentUserId as UserDto;
        currentUserId = profileId;
      }
      const profilePhotoOwnerId = hasImplicitOwner
        ? (await this.prisma.profile.findUnique({ where: { id: profileId }, select: { userId: true } }))?.userId
        : (currentUserId as string);
      const profilePhoto = await this.promoteProfilePhoto(profilePhotoOwnerId, accountDto.profilePhoto);
      const profilePhotoBlurhash = profilePhoto
        ? await blurhashFromUrl(profilePhoto, this.latencyMetrics)
        : accountDto.profilePhoto === null
          ? null
          : undefined;
      const profileData = this.withoutProfilePhotoAssetId(accountDto);
      return await this.prisma.profile.update({
        where: hasImplicitOwner ? { id: profileId } : { id: profileId, userId: currentUserId as string },
        data: {
          ...profileData,
          ...(profilePhoto !== undefined ? { profilePhoto } : {}),
          ...(hasImplicitOwner ? {} : { profilePhotoBlurhash }),
          ...(accountDto.profilePhoto === null
            ? { profilePhotoPendingAssetId: null, profilePhotoPendingBlurhash: null }
            : {}),
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async updateProfileByUserId(userId: string, currentUserId: string, accountDto: UserDto) {
    try {
      let targetUserId = userId;
      if (userId !== currentUserId) {
        const profileById = await this.prisma.profile.findUnique({
          where: { id: userId },
          select: { userId: true },
        });
        if (profileById?.userId !== currentUserId) throw new ForbiddenException('Недостаточно прав');
        targetUserId = currentUserId;
      }

      const data = this.withoutProfilePhotoAssetId(accountDto);
      delete data.profilePhoto;
      delete data.profilePhotoBlurhash;
      const photoData = await this.getProfilePhotoUpdateData(targetUserId, accountDto);
      const updatedProfile = await this.prisma.profile.upsert({
        where: { userId: targetUserId },
        update: { ...data, ...photoData, updatedAt: new Date() },
        create: { ...data, ...photoData, updatedAt: new Date(), userId: targetUserId },
      });
      return await this.presentProfilePhoto(updatedProfile, true);
    } catch (error) {
      handleServiceError(error);
    }
  }

  private async promoteProfilePhoto(userId: string | undefined, profilePhoto: UserDto['profilePhoto']) {
    if (!userId || !profilePhoto || !this.storageService) return profilePhoto;
    return await this.storageService.promoteProfilePhoto(userId, profilePhoto);
  }

  private async getProfilePhotoUpdateData(userId: string, accountDto: UserDto) {
    if (accountDto.profilePhotoAssetId) {
      if (!this.storageService) throw new ServiceUnavailableException('Проверка загружаемых медиафайлов не настроена');
      const asset = await this.prisma.mediaModerationAsset.findFirst({
        where: {
          id: accountDto.profilePhotoAssetId,
          ownerId: userId,
          role: 'media',
          scope: 'profile',
        },
        select: { status: true, publishedKey: true },
      });
      if (!asset) throw new BadRequestException('Загруженное фото профиля не найдено');
      if (asset.status === 'rejected' || asset.status === 'failed') {
        throw new BadRequestException('Фото профиля не прошло проверку');
      }

      const pendingBlurhash = accountDto.profilePhotoBlurhash ?? null;
      if (asset.status === 'approved') {
        const published = await this.storageService.publishApprovedModerationAsset(
          userId,
          accountDto.profilePhotoAssetId,
        );
        return {
          profilePhoto: published.url,
          profilePhotoBlurhash: pendingBlurhash ?? (await blurhashFromUrl(published.url, this.latencyMetrics)),
          profilePhotoPendingAssetId: null,
          profilePhotoPendingBlurhash: null,
        };
      }

      return {
        profilePhotoPendingAssetId: accountDto.profilePhotoAssetId,
        profilePhotoPendingBlurhash: pendingBlurhash,
      };
    }

    if (accountDto.profilePhoto !== undefined) {
      const profilePhoto = await this.promoteProfilePhoto(userId, accountDto.profilePhoto);
      const profilePhotoBlurhash = profilePhoto
        ? await blurhashFromUrl(profilePhoto, this.latencyMetrics)
        : accountDto.profilePhoto === null
          ? null
          : undefined;
      return {
        ...(profilePhoto !== undefined ? { profilePhoto } : {}),
        ...(profilePhotoBlurhash !== undefined ? { profilePhotoBlurhash } : {}),
        ...(accountDto.profilePhoto === null
          ? { profilePhotoPendingAssetId: null, profilePhotoPendingBlurhash: null }
          : {}),
      };
    }

    return accountDto.profilePhotoBlurhash !== undefined
      ? { profilePhotoBlurhash: accountDto.profilePhotoBlurhash }
      : {};
  }

  private async presentProfilePhoto<T extends ProfileWithPendingPhoto>(profile: T, isOwner: boolean) {
    const { profilePhotoPendingAssetId, profilePhotoPendingBlurhash, ...responseProfile } = profile;
    if (!profilePhotoPendingAssetId) return responseProfile;
    if (!this.storageService) {
      return {
        ...responseProfile,
        profilePhoto: null,
        profilePhotoBlurhash: profilePhotoPendingBlurhash,
        profilePhotoReviewStatus: 'queued' as const,
      };
    }

    const { items } = await this.storageService.getModerationUploadStatuses(profile.userId, [
      profilePhotoPendingAssetId,
    ]);
    const asset = items.find(({ assetId }) => assetId === profilePhotoPendingAssetId);
    if (!asset || asset.status === 'rejected' || asset.status === 'failed') {
      await this.prisma.profile.updateMany({
        where: { userId: profile.userId, profilePhotoPendingAssetId },
        data: { profilePhotoPendingAssetId: null, profilePhotoPendingBlurhash: null, updatedAt: new Date() },
      });
      return responseProfile;
    }

    if (asset.status === 'approved' && asset.url) {
      await this.prisma.profile.updateMany({
        where: { userId: profile.userId, profilePhotoPendingAssetId },
        data: {
          profilePhoto: asset.url,
          profilePhotoBlurhash: profilePhotoPendingBlurhash,
          profilePhotoPendingAssetId: null,
          profilePhotoPendingBlurhash: null,
          updatedAt: new Date(),
        },
      });
      return { ...responseProfile, profilePhoto: asset.url, profilePhotoBlurhash: profilePhotoPendingBlurhash };
    }

    const profilePhoto = isOwner
      ? await this.storageService.getOwnerModerationPreviewUrl(profile.userId, profilePhotoPendingAssetId)
      : null;
    return {
      ...responseProfile,
      profilePhoto,
      profilePhotoBlurhash: profilePhotoPendingBlurhash,
      profilePhotoReviewStatus: asset.status as ProfilePhotoReviewStage,
    };
  }

  private withoutProfilePhotoAssetId(accountDto: UserDto) {
    const data = { ...accountDto };
    delete data.profilePhotoAssetId;
    return data;
  }
}
