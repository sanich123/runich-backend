import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { ProfileDto } from './account.dto';
import { Pagination } from 'src/utils/pagination/pagination.decorator';

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllAccounts({ page, limit, size, offset }: Pagination) {
    try {
      const [count, profiles] = await this.prisma.$transaction([
        this.prisma.profile.count(),
        this.prisma.profile.findMany({
          skip: offset,
          take: limit,
        }),
      ]);
      return {
        totalItems: count,
        items: profiles,
        page,
        size
      };
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
