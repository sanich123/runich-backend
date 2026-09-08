import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { handleServiceError } from 'src/common/utils/database-errors';
import { UserDto } from './user.dto';
import { blurhashFromUrl } from 'src/common/images/blurhash';

@Injectable()
export class UserService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getProfileByUserId(userId: string) {
    try {
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
      const profilePhotoBlurhash = accountDto.profilePhoto ? await blurhashFromUrl(accountDto.profilePhoto) : null;
      return await this.prisma.profile.create({
        data: { ...accountDto, profilePhotoBlurhash, userId: id },
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
      const profilePhotoBlurhash = accountDto.profilePhoto
        ? await blurhashFromUrl(accountDto.profilePhoto)
        : accountDto.profilePhoto === null
          ? null
          : undefined;
      return await this.prisma.profile.update({
        where: hasImplicitOwner ? { id: profileId } : { id: profileId, userId: currentUserId as string },
        data: {
          ...accountDto,
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

      const profilePhotoBlurhash = accountDto.profilePhoto
        ? await blurhashFromUrl(accountDto.profilePhoto)
        : accountDto.profilePhoto === null
          ? null
          : undefined;
      const data = {
        ...accountDto,
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
}
