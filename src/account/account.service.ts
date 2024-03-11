import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { ProfileDto } from './account.dto';

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllAccounts() {
    try {
      return await this.prisma.profile.findMany();
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async updateProfileInfo({ emailNotifications }: ProfileDto, id: string) {
    try {
      return await this.prisma.profile.update({
        where: { id },
        data: {
          emailNotifications,
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getAccountByUserId(id: string) {
    try {
      return await this.prisma.profile.findUnique({ where: { user_id: id } });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
