import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { UserDto } from './user.dto';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

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
      return this.prisma.profile.create({
        data: { ...accountDto, user_id: id },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async updateProfileByProfileId(profileId: string, accountDto: UserDto) {
    try {
      return this.prisma.profile.update({
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
