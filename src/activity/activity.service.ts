import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { ActivityDto } from './activity.dto';
import { prismaErrorHandling } from 'src/utils/prisma-errors';

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async createActivity(activityDto: ActivityDto, id: string) {
    try {
      const updatedActivity = await this.prisma.user.update({
        where: { id },
        data: {
          activity: {
            create: activityDto,
          },
        },
      });
      return updatedActivity;
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
}
