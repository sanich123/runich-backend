import { CommentEmailDTO, CommentLikeEmailDTO, LikeEmailDTO } from './email.dto';
import { sendEmail } from 'src/common/email/nodemailer';
import { render } from '@react-email/components';
import {
  NotificationEmail,
  ConfirmEmailAddressWithLinkAndCode,
  PasswordChangeCode,
  ResetPasswordByLinkAndCode,
} from './templates';
import { EmailType } from './templates/types';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async sendLikeEmailNotification({
    profilePhoto,
    name,
    surname,
    recepientEmail,
    recepientName,
    recepientSurname,
    mapPhotoUrl,
  }: LikeEmailDTO) {
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
  }
  async sendConfirmationCode(emailAddress: string, confirmationCode: number, accessToken: string) {
    try {
      const subject = 'Подтверждение электронной почты';
      const html = await render(ConfirmEmailAddressWithLinkAndCode({ text: confirmationCode.toString(), accessToken }));
      await sendEmail(emailAddress, subject, html);
    } catch (error) {
      this.logger.error(`Failed to send confirmation email to ${emailAddress}`, error);
      throw error;
    }
  }

  async sendResetPasswordLink(emailAddress: string, accessToken: string) {
    try {
      const subject = 'Ссылка для сброса пароля';
      const html = await render(ResetPasswordByLinkAndCode({ accessToken }));
      await sendEmail(emailAddress, subject, html);
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${emailAddress}`, error);
      throw error;
    }
  }

  async sendPasswordChangeCode(emailAddress: string, recoveryCode: number) {
    try {
      const subject = 'Код для смены пароля';
      const html = await render(PasswordChangeCode({ text: recoveryCode.toString() }));
      await sendEmail(emailAddress, subject, html);
    } catch (error) {
      this.logger.error(`Failed to send password change code to ${emailAddress}`, error);
      throw error;
    }
  }
}
