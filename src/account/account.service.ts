import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { ProfileDto } from './account.dto';

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllAccounts() {
    return await this.prisma.profile.findMany();
  }

  async getAccountByUserId(id: string) {
    return await this.prisma.profile.findUnique({ where: { user_id: id } });
  }

  async createAccountByUserId(id: string, accountDto: ProfileDto) {
    return await this.prisma.profile.update({
      where: { user_id: id },
      data: accountDto,
    });
  }
}
