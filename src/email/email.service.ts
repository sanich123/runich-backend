import { FeedbackDto } from './email.dto';
import { sendEmail } from 'src/common/email/nodemailer';
import { render } from '@react-email/components';
import { ConfirmEmailAddressWithLinkAndCode, LoginByEmailLink, PasswordChangeCode } from './templates';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { LatencyMetricsService } from 'src/common/metrics/latency-metrics.service';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { getAuthFrontendRedirectUri } from 'src/common/config/environment';
import { escapeHtml } from './utils';
import { StorageService } from 'src/storage/storage.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma?: PrismaService,
    @Optional() @Inject(LatencyMetricsService) private readonly latencyMetrics?: LatencyMetricsService,
    @Optional() @Inject(StorageService) private readonly storageService?: StorageService,
  ) {}
  async sendConfirmationCode(emailAddress: string, confirmationCode: number, loginCredential: string) {
    try {
      const subject = 'Подтверждение электронной почты';
      const loginUrl = new URL(getAuthFrontendRedirectUri());
      loginUrl.searchParams.set('code', loginCredential);
      const html = await render(
        ConfirmEmailAddressWithLinkAndCode({ text: confirmationCode.toString(), loginUrl: loginUrl.toString() }),
      );
      await sendEmail(emailAddress, subject, html, [], this.latencyMetrics);
    } catch (error) {
      this.logger.error(`Не удалось отправить письмо с кодом подтверждения на ${emailAddress}`, error);
      throw error;
    }
  }

  async sendPasswordChangeCode(emailAddress: string, recoveryCode: number) {
    try {
      const subject = 'Код для смены пароля';
      const html = await render(PasswordChangeCode({ text: recoveryCode.toString() }));
      await sendEmail(emailAddress, subject, html, [], this.latencyMetrics);
    } catch (error) {
      this.logger.error(`Не удалось отправить код смены пароля на ${emailAddress}`, error);
      throw error;
    }
  }

  async sendLoginLink(emailAddress: string, loginCredential: string) {
    try {
      const loginUrl = new URL(getAuthFrontendRedirectUri());
      loginUrl.searchParams.set('code', loginCredential);

      const subject = 'Вход в Runich по ссылке';
      const html = await render(LoginByEmailLink({ loginUrl: loginUrl.toString() }));
      await sendEmail(emailAddress, subject, html, [], this.latencyMetrics);
    } catch (error) {
      this.logger.error(`Не удалось отправить ссылку для входа на ${emailAddress}`, error);
      throw error;
    }
  }

  async sendFeedback(feedback: FeedbackDto, userId: string) {
    if (!this.prisma) throw new Error('PrismaService не настроен для отправки feedback');

    const user = await this.prisma.user.findUnique({
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
    const label = labels[feedback.kind] ?? 'Обратная связь';
    const name =
      [user.profile?.name, user.profile?.surname]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
        .join(' ') || 'Имя не указано';
    const email = escapeHtml(user.email);
    const subject = `[Runich] ${label} от ${name} <${user.email}>`;
    const attachments = feedback.attachments ?? [];
    this.getFeedbackAttachmentKeys(userId, feedback);
    const attachmentsHtml = attachments.length
      ? [
          '<h3>Вложения</h3>',
          '<ul>',
          ...attachments.map(({ url }, index) => `<li><a href="${escapeHtml(url)}">Вложение ${index + 1}</a></li>`),
          '</ul>',
        ].join('')
      : '';
    const html = [
      `<h2>${escapeHtml(label)}</h2>`,
      `<p><b>Пользователь:</b> ${escapeHtml(name)}</p>`,
      `<p><b>Email:</b> <a href="mailto:${email}">${email}</a></p>`,
      `<p><b>Устройство:</b><br>${escapeHtml(feedback.deviceInfo).replaceAll('\n', '<br>')}</p>`,
      `<p>${escapeHtml(feedback.text).replaceAll('\n', '<br>')}</p>`,
      attachmentsHtml,
    ].join('');
    // Feedback media is uploaded independently from SMTP delivery. Keep the
    // validated S3 links when SMTP is unavailable so the client can show the
    // user that the file was uploaded and provide a usable link.
    await sendEmail('aovoronin.piano@gmail.com', subject, html, [], this.latencyMetrics);
  }

  private getFeedbackAttachmentKeys(userId: string, feedback: FeedbackDto) {
    if (!feedback.attachments?.length) return [];
    if (!this.storageService) {
      throw new ServiceUnavailableException('S3-хранилище не настроено для вложений feedback');
    }

    const urls = feedback.attachments.flatMap(({ url, thumbnail }) =>
      [url, thumbnail].filter((value): value is string => Boolean(value)),
    );
    return [...new Set(urls.map((url) => this.validateFeedbackAttachment(userId, feedback.feedbackId, url)))];
  }

  private validateFeedbackAttachment(userId: string, feedbackId: string, url: string) {
    if (!this.storageService) throw new ServiceUnavailableException('S3-хранилище не настроено');
    const key = this.storageService.getOwnedKey(userId, url);
    const relativeKey = key.slice(`${userId}/`.length);
    const [, dateFolder, attachmentFeedbackId, fileName] = relativeKey.split('/');
    if (
      !relativeKey.startsWith('feedback/') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dateFolder ?? '') ||
      attachmentFeedbackId !== feedbackId ||
      !fileName
    ) {
      throw new BadRequestException('Вложение feedback имеет некорректный S3-путь');
    }
    return key;
  }
}
