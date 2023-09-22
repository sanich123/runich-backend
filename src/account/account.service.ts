import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllAccounts() {
    return await this.prisma.user_profiles.findMany();
  }
}
