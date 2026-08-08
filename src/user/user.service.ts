import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { prismaErrorHandling } from 'src/common/utils/prisma-errors';
import { UserDto } from './user.dto';

@Injectable()
export class UserService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getAllUsers() {
    try {
      return await this.prisma.users.findMany({
        select: { profile: true },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getProfileByUserId(userId: string) {
    try {
      return await this.prisma.profile.findUnique({ where: { user_id: userId } });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async createProfileByUserId(id: string, accountDto: UserDto) {
    try {
      return await this.prisma.profile.create({
        data: { ...accountDto, user_id: id },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async updateProfileByProfileId(profileId: string, accountDto: UserDto) {
    try {
      return await this.prisma.profile.update({
        where: { id: profileId },
        data: { ...accountDto, updatedAt: new Date() },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
  async deleteUserByUserId(userId: string) {
    try {
      return await this.prisma.users.delete({ where: { id: userId } });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
