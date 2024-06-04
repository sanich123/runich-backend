import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { ProfileDto } from './account.dto';
import { Pagination } from 'src/utils/pagination/pagination.decorator';
import { Filtering } from './filter.decorator';

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
        page: page,
        size: size,
      };
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getFilteredAccounts({ page, limit, size, offset }: Pagination, filter: Filtering) {
    try {
      const profiles = await this.prisma.profile.findMany({
        where: {
          OR: [
            { name: { contains: filter.name } },
            { name: { contains: filter.surname } },
            { email: { contains: filter.email } },

            { city: { contains: filter.city } },
            { gender: { equals: filter.gender } },
            { sport: { equals: filter.sport } },
          ],
        },
        skip: offset,
        take: limit,
      });

      if ((page === 0 && profiles.length === limit) || page !== 0) {
        const count = await this.prisma.profile.count({
          where: {
            OR: [
              { name: { contains: filter.name } },
              { name: { contains: filter.surname } },
              { email: { contains: filter.email } },
              { email: { equals: filter.email } },
              { city: { contains: filter.city } },
              { gender: { equals: filter.gender } },
              { sport: { equals: filter.sport } },
            ],
          },
        });

        return {
          totalItems: count,
          items: profiles,
          page,
          size,
        };
      }
      return {
        totalItems: profiles.length,
        items: profiles,
        page,
        size,
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
