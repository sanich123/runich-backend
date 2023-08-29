import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { ProfileDto } from './profile.dto';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: string) {
    return await this.prisma.profile.findUnique({ where: { userId: id } });
  }

  async createProfile(createProfileDto: ProfileDto) {
    return await this.prisma.profile.create({
      data: createProfileDto,
    });
  }

  async getAll() {
    return await this.prisma.profile.findMany();
  }
}
