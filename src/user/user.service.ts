import { ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import { LatencyMetricsService } from 'src/common/metrics/latency-metrics.service';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { handleServiceError } from 'src/common/utils/database-errors';
import { UserDto } from './user.dto';
import { blurhashFromUrl } from 'src/common/images/blurhash';
import { StorageService } from 'src/storage/storage.service';
import { PUBLIC_USER_PROFILE_SELECT } from 'src/account/const';
import { ModerationAccessService } from 'src/moderation/moderation-access.service';

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
        return await this.prisma.profile.findUnique({ where: { userId }, select: PUBLIC_USER_PROFILE_SELECT });
      }
      return await this.prisma.profile.findUnique({ where: { userId } });
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
        data: { ...accountDto, profilePhoto, profilePhotoBlurhash, userId: id },
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
      return await this.prisma.profile.update({
        where: hasImplicitOwner ? { id: profileId } : { id: profileId, userId: currentUserId as string },
        data: {
          ...accountDto,
          ...(profilePhoto !== undefined ? { profilePhoto } : {}),
          ...(hasImplicitOwner ? {} : { profilePhotoBlurhash }),
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

      const profilePhoto = await this.promoteProfilePhoto(targetUserId, accountDto.profilePhoto);
      const profilePhotoBlurhash = profilePhoto
        ? await blurhashFromUrl(profilePhoto, this.latencyMetrics)
        : accountDto.profilePhoto === null
          ? null
          : undefined;
      const data = {
        ...accountDto,
        ...(profilePhoto !== undefined ? { profilePhoto } : {}),
        ...(profilePhotoBlurhash !== undefined ? { profilePhotoBlurhash } : {}),
        updatedAt: new Date(),
      };

      return await this.prisma.profile.upsert({
        where: { userId: targetUserId },
        update: data,
        create: { ...data, userId: targetUserId },
      });
    } catch (error) {
      handleServiceError(error);
    }
  }

  private async promoteProfilePhoto(userId: string | undefined, profilePhoto: UserDto['profilePhoto']) {
    if (!userId || !profilePhoto || !this.storageService) return profilePhoto;
    return await this.storageService.promoteProfilePhoto(userId, profilePhoto);
  }
}
