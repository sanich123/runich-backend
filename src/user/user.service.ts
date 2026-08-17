import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { handleServiceError } from 'src/common/utils/prisma-errors';
import { UserDto } from './user.dto';
import { blurhashFromUrl } from 'src/common/images/blurhash';

@Injectable()
export class UserService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getProfileByUserId(userId: string) {
    try {
      return await this.prisma.profile.findUnique({ where: { user_id: userId } });
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
      if (id !== currentUserId) throw new Error('Недостаточно прав');
      const profilePhotoBlurhash = accountDto.profilePhoto ? await blurhashFromUrl(accountDto.profilePhoto) : null;
      return await this.prisma.profile.create({
        data: { ...accountDto, profilePhotoBlurhash, user_id: id },
      });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async updateProfileByProfileId(profileId: string, currentUserId: string | UserDto, accountDto?: UserDto) {
    try {
      const legacyCall = !accountDto;
      if (!accountDto) {
        accountDto = currentUserId as UserDto;
        currentUserId = profileId;
      }
      const profilePhotoBlurhash = accountDto.profilePhoto
        ? await blurhashFromUrl(accountDto.profilePhoto)
        : accountDto.profilePhoto === null
          ? null
          : undefined;
      return await this.prisma.profile.update({
        where: legacyCall ? { id: profileId } : { id: profileId, user_id: currentUserId as string },
        data: {
          ...accountDto,
          ...(legacyCall ? {} : { profilePhotoBlurhash }),
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      handleServiceError(error);
    }
  }
}
