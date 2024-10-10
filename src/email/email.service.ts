import { Injectable } from '@nestjs/common';
import { ActivityService } from 'src/activity/activity.service';
import { CommentEmailDTO, CommentLikeEmailDTO, LikeEmailDTO } from './email.dto';
import { sendEmail } from 'src/utils/email/nodemailer';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { CommentService } from 'src/comment/comment.service';

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
      const subject = 'Лайк к вашей активности';
      const html = `<p>Уважаемый ${recepientName} ${recepientSurname}!</p>
        <img src="${profilePhoto}" width="100" height="100" style="object-fit: contain"/>
        <p>${name} ${surname} только что лайкнул вашу активность!</p>
        ${mapPhotoUrl ? `<img src="${mapPhotoUrl}" width="99%"/>` : ''}`;
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
      const html = `<p>Уважаемый ${recepientName} ${recepientSurname}!</p>
        <img src="${profilePhoto}" width="100" height="100" style="object-fit: contain"/>
        <p>${name} ${surname} только что прокомментировал вашу активность!</p>
        ${mapPhotoUrl ? `<img src="${mapPhotoUrl}" width="99%"/>` : ''}
        <blockquote><p>${comment}</p></blockquote>`;
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
      const html = `<p>Уважаемый ${recepientName} ${recepientSurname}!</p>
        <img src="${profilePhoto}" width="100" height="100" style="object-fit: contain"/>
        <p>${name} ${surname} только что лайкнул Ваш комментарий!</p>
        <blockquote><p>${comment}</p></blockquote>`;
      await sendEmail(recepientEmail, subject, html);
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
