import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { ActivityDto } from './activity.dto';

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async createActivity(activityDto: ActivityDto, id: string) {
    const updatedActivity = await this.prisma.user.update({
      where: { id },
      data: {
        activity: {
          create: activityDto,
        },
      },
    });
    return updatedActivity;
  }
}
