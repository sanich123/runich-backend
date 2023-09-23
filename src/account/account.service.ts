import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { ProfileDto } from './account.dto';
import { prismaErrorHandling } from 'src/utils/prisma-errors';

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllAccounts() {
    return await this.prisma.profile.findMany();
  }

  async getAccountByUserId(id: string) {
    return await this.prisma.profile.findUnique({ where: { user_id: id } });
  }

  async updateAccountByUserId(id: string, accountDto: ProfileDto) {
    return await this.prisma.profile.update({
      where: { user_id: id },
      data: accountDto,
    });
  }

  async createAccountByUserId(id: string, accountDto: ProfileDto) {
    try {
      return await this.prisma.users.update({
        where: { id },
        data: {
          profile: {
            upsert: {
              where: { user_id: id },
              update: accountDto,
              create: accountDto,
            },
          },
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
