import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { ActivityDto } from './activity.dto';
import { prismaErrorHandling } from 'src/utils/prisma-errors';

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async createActivity(activityDto: ActivityDto, id: string) {
    try {
      return await this.prisma.user.update({
        where: { id },
        data: {
          version: { increment: 1 },
          activity: {
            create: activityDto,
          },
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getActivityByActivityId(id: string) {
    try {
      return await this.prisma.activity.findUnique({ where: { id } });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getActivitesByUserId(id: string) {
    try {
      return await this.prisma.activity.findMany({ where: { userId: id } });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async deleteActivityById(id: string) {
    try {
      return await this.prisma.activity.delete({ where: { id } });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
