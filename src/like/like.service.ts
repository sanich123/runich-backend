import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { LikeDto } from './like.dto';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { AccountService } from 'src/account/account.service';
import { sendEmail } from 'src/utils/email/nodemailer';
import { ActivityService } from 'src/activity/activity.service';

@Injectable()
export class LikeService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly accountService: AccountService,
    private readonly activityService: ActivityService,
  ) {}

  async addLike({ authorId, activityId }: LikeDto) {
    try {
      const account = await this.accountService.getAccountByUserId(authorId);
      if (account?.id) {
        const createdLike = await this.prismaService.like.create({
          data: {
            profileId: account.id,
            authorId,
            activityId,
          },
        });
        const {
          profile: { emailNotifications, name, surname },
          email,
          mapPhotoUrl,
        } = await this.activityService.getActivityWithEmailData(activityId);

        if (emailNotifications && account) {
          const subject = 'Лайк к вашей активности';
          const html = `<p>Уважаемый ${name} ${surname}!</p>
        <img src="${account.profilePhoto}" width="100" height="100" style="object-fit: contain"/>
        <p>${account.name} ${account.surname} только что лайкнул вашу активность!</p>
        ${mapPhotoUrl ? `<img src="${mapPhotoUrl}" width="99%"/>` : ''}`;
          await sendEmail(email, subject, html);
        }

        return createdLike;
      } else {
        throw new NotFoundException();
      }
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
        orderBy: { date: 'desc' },
        include: { profile: true },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
