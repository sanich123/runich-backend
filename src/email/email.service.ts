import { ActivityService } from 'src/activity/activity.service';
import { CommentEmailDTO, CommentLikeEmailDTO, LikeEmailDTO } from './email.dto';
import { sendEmail } from 'src/utils/email/nodemailer';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { CommentService } from 'src/comment/comment.service';
import { render } from '@react-email/components';
import { NotificationEmail } from './templates';
import { EmailType } from './templates/types';
import { Injectable } from '@nestjs/common/decorators/core';

@Injectable()
export class EmailService {
  constructor(private readonly commentService: CommentService, private readonly activityService: ActivityService) {}

  async sendLikeEmailNotification({
    profilePhoto,
    name,
    surname,
    recepientEmail,
    recepientName,
    recepientSurname,
    mapPhotoUrl,
  }: LikeEmailDTO) {
    try {
      const subject = 'Лайк к активности';
      const html = await render(
        NotificationEmail({
          type: EmailType.like,
          mapPhotoUrl,
          name,
          surname,
          profilePhoto,
          recepientName,
          recepientSurname,
        }),
      );
      await sendEmail(recepientEmail, subject, html);
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async sendCommentEmailNotification({
    profilePhoto,
    name,
    surname,
    comment,
    recepientEmail,
    recepientName,
    recepientSurname,
    mapPhotoUrl,
  }: CommentEmailDTO) {
    try {
      const subject = 'Новый комментарий к вашей активности';
      const html = await render(
        NotificationEmail({
          type: EmailType.comment,
          mapPhotoUrl,
          comment,
          name,
          surname,
          profilePhoto,
          recepientName,
          recepientSurname,
        }),
      );
      await sendEmail(recepientEmail, subject, html);
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async sendCommentLikeEmailNotification({
    profilePhoto,
    name,
    surname,
    comment,
    recepientEmail,
    recepientName,
    recepientSurname,
  }: CommentLikeEmailDTO) {
    try {
      const subject = 'Лайк к вашему комментарию';
      const html = await render(
        NotificationEmail({
          type: EmailType.commentLike,
          comment,
          name,
          surname,
          profilePhoto,
          recepientName,
          recepientSurname,
        }),
      );
      await sendEmail(recepientEmail, subject, html);
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
