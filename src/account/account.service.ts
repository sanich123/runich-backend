import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllAccounts() {
    return await this.prisma.profile.findMany();
  }

  async getAccountByUserId(id: string) {
    return await this.prisma.profile.findUnique({ where: { user_id: id } });
  }
}
