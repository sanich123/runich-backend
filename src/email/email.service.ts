import { CommentEmailDTO, CommentLikeEmailDTO, LikeEmailDTO } from './email.dto';
import { sendEmail } from 'src/common/email/nodemailer';
import { render } from '@react-email/components';
import { ConfirmEmailAddressWithLinkAndCode, LoginByEmailLink, PasswordChangeCode } from './templates';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EmailNotificationService } from './email-notification.service';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character,
  );
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  private readonly notificationService: EmailNotificationService;

  constructor(
    @Inject(EmailNotificationService) notificationService?: EmailNotificationService,
    @Inject(PrismaService) private readonly prisma?: PrismaService,
  ) {
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
  async sendConfirmationCode(emailAddress: string, confirmationCode: number, loginCredential: string) {
    try {
      const subject = 'Подтверждение электронной почты';
      const loginUrl = new URL('https://stage--runich.netlify.app/login-from-url');
      loginUrl.searchParams.set('code', loginCredential);
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

  async sendLoginLink(emailAddress: string, loginCredential: string) {
    try {
      const loginUrl = new URL('https://stage--runich.netlify.app/login-from-url');
      loginUrl.searchParams.set('code', loginCredential);

      const subject = 'Вход в Runich по ссылке';
      const html = await render(LoginByEmailLink({ loginUrl: loginUrl.toString() }));
      await sendEmail(emailAddress, subject, html);
    } catch (error) {
      this.logger.error(`Не удалось отправить ссылку для входа на ${emailAddress}`, error);
      throw error;
    }
  }

  async sendFeedback(kind: string, userId: string, text: string, deviceInfo: string, photo?: Express.Multer.File) {
    if (!this.prisma) throw new Error('PrismaService не настроен для отправки feedback');

    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        email: true,
        profile: { select: { name: true, surname: true } },
      },
    });
    if (!user) throw new NotFoundException('Пользователь для feedback не найден');

    const labels: Record<string, string> = {
      bug: 'Поведать о баге',
      thanks: 'Поблагодарить разработчика',
      feature: 'Хочу фичу',
    };
    const label = labels[kind] ?? 'Обратная связь';
    const name = [user.profile?.name, user.profile?.surname]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .join(' ') || 'Имя не указано';
    const email = escapeHtml(user.email);
    const subject = `[Runich] ${label} от ${name} <${user.email}>`;
    const html = [
      `<h2>${escapeHtml(label)}</h2>`,
      `<p><b>Пользователь:</b> ${escapeHtml(name)}</p>`,
      `<p><b>Email:</b> <a href="mailto:${email}">${email}</a></p>`,
      `<p><b>Устройство:</b><br>${escapeHtml(deviceInfo).replaceAll('\n', '<br>')}</p>`,
      `<p>${escapeHtml(text).replaceAll('\n', '<br>')}</p>`,
    ].join('');
    await sendEmail(
      'aovoronin.piano@gmail.com',
      subject,
      html,
      photo ? [{ filename: photo.originalname, content: photo.buffer, contentType: photo.mimetype }] : [],
    );
  }
}
