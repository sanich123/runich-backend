import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { ProfileDto } from './profile.dto';
import { prismaErrorHandling } from 'src/utils/prisma-errors';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: string) {
    try {
      return await this.prisma.profile.findUnique({ where: { userId: id } });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async createProfile(createProfileDto: ProfileDto) {
    try {
      return await this.prisma.profile.create({
        data: createProfileDto,
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getAll() {
    try {
      return await this.prisma.profile.findMany();
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
