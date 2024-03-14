import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { LikeDto } from './like.dto';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { AccountService } from 'src/account/account.service';
import { sendEmail } from 'src/utils/email/email';

@Injectable()
export class LikeService {
  constructor(private readonly prismaService: PrismaService, private readonly accountService: AccountService) {}

  async sendOrDeleteLike({ authorId, activityId }: LikeDto) {
    try {
      const activity = await this.prismaService.activity.findUnique({
        where: { id: activityId },
        select: {
          users: true,
          profile: true,
          likes: true,
          mapPhotoUrl: true,
        },
      });
      const isLikedActivity = activity.likes.filter(({ authorId: likeAuthor }) => likeAuthor === authorId);
      if (isLikedActivity.length) {
        return await this.prismaService.like.delete({
          where: { id: isLikedActivity[0].id },
        });
      }
      const account = await this.accountService.getAccountByUserId(authorId);
      if (activity.profile.emailNotifications && account) {
        const receiverEmailAddress = activity.users?.email;
        const subject = 'Лайк к активности';
        const message = `<p>Уважаемый ${activity.profile.name}!</p>
        <img src="${activity.profile.profilePhoto}"/>
        <p>${account.name} только что лайкнул вашу активность!</p>
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
