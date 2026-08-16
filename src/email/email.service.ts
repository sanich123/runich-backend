import { CommentEmailDTO, CommentLikeEmailDTO, LikeEmailDTO } from './email.dto';
import { sendEmail } from 'src/common/email/nodemailer';
import { render } from '@react-email/components';
import { ConfirmEmailAddressWithLinkAndCode, LoginByEmailLink, PasswordChangeCode } from './templates';
import { Injectable, Logger } from '@nestjs/common';
import { EmailNotificationService } from './email-notification.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  private readonly notificationService: EmailNotificationService;

  constructor(notificationService?: EmailNotificationService) {
    this.notificationService = notificationService ?? new EmailNotificationService();
  }

  async sendLikeEmailNotification({
    profilePhoto,
    name,
    surname,
    recepientEmail,
    recepientName,
    recepientSurname,
    mapPhotoUrl,
  }: LikeEmailDTO) {
    return this.notificationService.sendLike({
      profilePhoto,
      name,
      surname,
      recepientEmail,
      recepientName,
      recepientSurname,
      mapPhotoUrl,
    });
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
    return this.notificationService.sendComment({
      profilePhoto,
      name,
      surname,
      comment,
      recepientEmail,
      recepientName,
      recepientSurname,
      mapPhotoUrl,
    });
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
    return this.notificationService.sendCommentLike({
      profilePhoto,
      name,
      surname,
      comment,
      recepientEmail,
      recepientName,
      recepientSurname,
    });
  }
  async sendConfirmationCode(emailAddress: string, confirmationCode: number, accessToken: string) {
    try {
      const subject = 'Подтверждение электронной почты';
      const loginUrl = new URL('https://stage--runich.netlify.app/login-from-url');
      loginUrl.searchParams.set('accessToken', accessToken);
      const html = await render(
        ConfirmEmailAddressWithLinkAndCode({ text: confirmationCode.toString(), loginUrl: loginUrl.toString() }),
      );
      await sendEmail(emailAddress, subject, html);
    } catch (error) {
      this.logger.error(`Не удалось отправить письмо с кодом подтверждения на ${emailAddress}`, error);
      throw error;
    }
  }

  async sendPasswordChangeCode(emailAddress: string, recoveryCode: number) {
    try {
      const subject = 'Код для смены пароля';
      const html = await render(PasswordChangeCode({ text: recoveryCode.toString() }));
      await sendEmail(emailAddress, subject, html);
    } catch (error) {
      this.logger.error(`Не удалось отправить код смены пароля на ${emailAddress}`, error);
      throw error;
    }
  }

  async sendLoginLink(emailAddress: string, accessToken: string) {
    try {
      const loginUrl = new URL('https://stage--runich.netlify.app/login-from-url');
      loginUrl.searchParams.set('accessToken', accessToken);

      const subject = 'Вход в Runich по ссылке';
      const html = await render(LoginByEmailLink({ loginUrl: loginUrl.toString() }));
      await sendEmail(emailAddress, subject, html);
    } catch (error) {
      this.logger.error(`Не удалось отправить ссылку для входа на ${emailAddress}`, error);
      throw error;
    }
  }

  async sendFeedback(kind: string, userId: string, text: string, deviceInfo: string, photo?: Express.Multer.File) {
    const labels: Record<string, string> = {
      bug: 'Поведать о баге',
      thanks: 'Поблагодарить разработчика',
      feature: 'Хочу фичу',
    };
    const subject = `[Runich] ${labels[kind] ?? 'Обратная связь'} от ${userId}`;
    const html = `<h2>${labels[kind] ?? 'Обратная связь'}</h2><p><b>userId:</b> ${userId}</p><p><b>Устройство:</b><br>${deviceInfo}</p><p>${text.replaceAll('\n', '<br>')}</p>`;
    await sendEmail(
      'aovoronin.piano@gmail.com',
      subject,
      html,
      photo ? [{ filename: photo.originalname, content: photo.buffer, contentType: photo.mimetype }] : [],
    );
  }
}
