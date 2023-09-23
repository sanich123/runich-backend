import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { ProfileDto } from 'src/account/account.dto';
import { prismaErrorHandling } from 'src/utils/prisma-errors';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllUsers() {
    try {
      return await this.prisma.users.findMany();
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  // async getAccountByUserId(id: string) {
  //   return await this.prisma.profile.findUnique({ where: { user_id: id } });
  // }

  // async updateAccountByUserId(id: string, accountDto: ProfileDto) {
  //   return await this.prisma.profile.update({
  //     where: { user_id: id },
  //     data: accountDto,
  //   });
  // }

  async upsertAccountByUserId(id: string, accountDto: ProfileDto) {
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
