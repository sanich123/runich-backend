import { CommentEmailDTO, CommentLikeEmailDTO, LikeEmailDTO } from './email.dto';
import { sendEmail } from 'src/utils/email/nodemailer';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { render } from '@react-email/components';
import { NotificationEmail, ConfirmEmailAddressWithLinkAndCode, ResetPasswordByLinkAndCode } from './templates';
import { EmailType } from './templates/types';
import { Injectable } from '@nestjs/common';

@Injectable()
export class EmailService {
  constructor() {}

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
  async sendConfirmationCode(emailAddress: string, confirmationCode: number, accessToken: string) {
    try {
      const subject = 'Подтверждение электронной почты';
      const html = await render(ConfirmEmailAddressWithLinkAndCode({ text: confirmationCode.toString(), accessToken }));
      await sendEmail(emailAddress, subject, html);
    } catch (error) {
      console.log(error);
    }
  }

  async sendResetPasswordLink(emailAddress: string, accessToken: string) {
    try {
      const subject = 'Ссылка для сброса пароля';
      const html = await render(ResetPasswordByLinkAndCode({ accessToken }));
      await sendEmail(emailAddress, subject, html);
    } catch (error) {
      console.log(error);
    }
  }
}
