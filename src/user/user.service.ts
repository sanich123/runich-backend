import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { prismaErrorHandling } from 'src/common/utils/prisma-errors';
import { UserDto } from './user.dto';
import { blurhashFromUrl } from 'src/common/images/blurhash';

@Injectable()
export class UserService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getProfileByUserId(userId: string) {
    try {
      return await this.prisma.profile.findUnique({ where: { user_id: userId } });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async createProfileByUserId(id: string, accountDto: UserDto) {
    try {
      const profilePhotoBlurhash = accountDto.profilePhoto ? await blurhashFromUrl(accountDto.profilePhoto) : null;
      return await this.prisma.profile.create({
        data: { ...accountDto, profilePhotoBlurhash, user_id: id },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async updateProfileByProfileId(profileId: string, accountDto: UserDto) {
    try {
      const profilePhotoBlurhash = accountDto.profilePhoto
        ? await blurhashFromUrl(accountDto.profilePhoto)
        : accountDto.profilePhoto === null
          ? null
          : undefined;
      return await this.prisma.profile.update({
        where: { id: profileId },
        data: { ...accountDto, profilePhotoBlurhash, updatedAt: new Date() },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
