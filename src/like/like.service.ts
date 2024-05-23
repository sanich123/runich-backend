import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { LikeDto } from './like.dto';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { AccountService } from 'src/account/account.service';
import { sendEmail } from 'src/utils/email/email';

@Injectable()
export class LikeService {
  constructor(private readonly prismaService: PrismaService, private readonly accountService: AccountService) {}

  async addLike({ authorId, activityId }: LikeDto) {
    try {
      const activity = await this.prismaService.activity.findUnique({
        where: { id: activityId },
        select: {
          users: {
            select: {
              email: true,
            },
          },
          profile: {
            select: {
              id: true,
              profilePhoto: true,
              name: true,
              emailNotifications: true,
            },
          },
          mapPhotoUrl: true,
        },
      });
      const account = await this.accountService.getAccountByUserId(authorId);
      if (activity.profile.emailNotifications && account) {
        const receiverEmailAddress = activity.users?.email;
        const subject = 'Лайк к активности';
        const message = `<p>Уважаемый ${activity.profile.name}!</p>
        <img src="${activity.profile.profilePhoto}"/>
        <p>${activity.profile.name} только что лайкнул вашу активность!</p>
        ${activity.mapPhotoUrl ? `<img src="${activity.mapPhotoUrl}" width="350px" height="200px"/>` : ''}`;
        sendEmail([receiverEmailAddress], subject, message);
      }

      return await this.prismaService.like.create({
        data: {
          profileId: account.id,
          authorId,
          activityId,
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async deleteLikeById(id: string) {
    return await this.prismaService.like.delete({ where: { id } });
  }

  async getLikesByActivityId(id: string) {
    try {
      return await this.prismaService.like.findMany({
        where: { activityId: id },
        orderBy: {
          date: 'desc',
        },
        include: {
          profile: true,
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
