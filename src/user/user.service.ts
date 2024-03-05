import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { ProfileDto } from 'src/account/account.dto';
import { AccountService } from 'src/account/account.service';
import { prismaErrorHandling } from 'src/utils/prisma-errors';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService, private readonly profile: AccountService) {}

  async getAllUsers() {
    try {
      return await this.prisma.users.findMany({
        select: { profile: true },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

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
