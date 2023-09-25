import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { prismaErrorHandling } from 'src/utils/prisma-errors';

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

  async getAccountByUserId(id: string) {
    try {
      return await this.prisma.profile.findUnique({ where: { user_id: id } });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
