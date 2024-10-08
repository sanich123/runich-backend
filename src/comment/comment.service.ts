import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { CommentDTO, CommentLikeDto } from './comment.dto';
import { AccountService } from 'src/account/account.service';
import { ActivityService } from 'src/activity/activity.service';
import { sendEmail } from 'src/utils/email/nodemailer';

@Injectable()
export class CommentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountService: AccountService,
    private readonly activityService: ActivityService,
  ) {}

  async getCommentsbyActivityId(id: string, take: string) {
    try {
      const allCommentsLength = await this.prisma.comment.count({
        where: {
          activityId: id,
        },
      });
      const takenComments = await this.prisma.comment.findMany({
        where: { activityId: id },
        orderBy: { date: 'desc' },
        include: {
          profile: {
            select: {
              surname: true,
              name: true,
              profilePhoto: true,
              profilePhotoBlurhash: true,
            },
          },
          commentLike: {
            select: {
              authorId: true,
              id: true,
            },
          },
        },
        take: Number(take),
      });
      return {
        comments: takenComments,
        allCommentsLength,
      };
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getCommentsLengthbyActivityId(id: string) {
    try {
      return await this.prisma.comment.count({ where: { activityId: id } });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async createCommentByActivityId({ comment, authorId }: CommentDTO, id: string) {
    try {
      const account = await this.accountService.getAccountByUserId(authorId);
      if (!account?.id) throw new NotFoundException();

      const createdComment = await this.prisma.comment.create({
        data: {
          profileId: account.id,
          activityId: id,
          authorId,
          comment,
        },
      });

      const {
        profile: { emailNotifications, name, surname },
        email,
        mapPhotoUrl,
      } = await this.activityService.getActivityWithEmailData(id);

      if (emailNotifications && account) {
        const subject = 'Новый комментарий к вашей активности';
        const html = `<p>Уважаемый ${name} ${surname}!</p>
        <img src="${account.profilePhoto}" width="100" height="100" style="object-fit: contain"/>
        <p>${account.name} ${account.surname} только что прокомментировал вашу активность!</p>
        ${mapPhotoUrl ? `<img src="${mapPhotoUrl}" width="99%"/>` : ''}
        <blockquote><p>${comment}</p></blockquote>`;
        await sendEmail(email, subject, html);
      }

      return createdComment;
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async deleteCommentByCommentId(id: string) {
    try {
      return await this.prisma.comment.delete({ where: { id } });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async updateCommentByCommentId(comment: string, id: string) {
    try {
      return await this.prisma.comment.update({
        where: { id },
        data: { comment },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getCommentByCommentId(id: string) {
    try {
      const comment = await this.prisma.comment.findUnique({
        where: { id },
        include: {
          profile: {
            include: {
              users: {
                select: {
                  email: true,
                },
              },
            },
          },
        },
      });
      return { profile: comment.profile, email: comment.profile.users.email, comment: comment.comment };
    } catch (error) {
      console.log(error);
      prismaErrorHandling(error);
    }
  }

  async createCommentLikeByCommentId({ commentId, authorId }: CommentLikeDto) {
    try {
      const account = await this.accountService.getAccountByUserId(authorId);
      if (!account?.id) throw new NotFoundException();
      const createdCommentLike = await this.prisma.commentLike.create({
        data: {
          profileId: account.id,
          authorId,
          commentId,
        },
      });
      const {
        profile: { emailNotifications, name, surname },
        email,
        comment,
      } = await this.getCommentByCommentId(commentId);

      if (emailNotifications && account) {
        const subject = 'Лайк к вашему комментарию';
        const html = `<p>Уважаемый ${name} ${surname}!</p>
        <img src="${account.profilePhoto}" width="100" height="100" style="object-fit: contain"/>
        <p>${account.name} ${account.surname} только что лайкнул Ваш комментарий!</p>
        <blockquote><p>${comment}</p></blockquote>`;
        await sendEmail(email, subject, html);
      }

      return createdCommentLike;
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async deleteCommentLikeByLikeId(id: string) {
    try {
      return await this.prisma.commentLike.delete({ where: { id } });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getCommentLikesLengthByCommentId(id: string) {
    try {
      return await this.prisma.commentLike.findMany({ where: { commentId: id }, select: { authorId: true, id: true } });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
