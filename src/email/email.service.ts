import { sendEmail, sendSupportEmail } from 'src/common/email/nodemailer';
import { render } from '@react-email/components';
import {
  ConfirmEmailAddressWithLinkAndCode,
  FeedbackReceiptEmail,
  FeedbackReplyEmail,
  LoginByEmailLink,
  NewFeedbackEmail,
  PasswordChangeCode,
} from './templates';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { LatencyMetricsService } from 'src/common/metrics/latency-metrics.service';
import { getAuthFrontendRedirectUri } from 'src/common/config/environment';
import { MODERATION_EMAIL_RECIPIENT } from './email-notification.constants';
import type { NewFeedbackEmailData } from './email.types';
import { formatFeedbackDateTime } from './format-feedback-date-time';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(@Optional() @Inject(LatencyMetricsService) private readonly latencyMetrics?: LatencyMetricsService) {}
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

  async sendNewFeedbackNotification(request: NewFeedbackEmailData) {
    const adminUrl = new URL(getAuthFrontendRedirectUri());
    adminUrl.pathname = '/admin';
    adminUrl.search = '';
    adminUrl.hash = '';
    adminUrl.searchParams.set('feedbackId', request.id);
    const html = await render(
      NewFeedbackEmail({
        createdAt: request.createdAt,
        kind: request.kind,
        topic: request.topic,
        email: request.email,
        text: request.text,
        deviceInfo: request.deviceInfo,
        attachments: request.attachments,
        adminUrl: adminUrl.toString(),
      }),
    );
    await sendSupportEmail(
      MODERATION_EMAIL_RECIPIENT,
      `[Runich] Новое обращение: ${request.kind}`,
      html,
      this.latencyMetrics,
    );
  }

  async sendFeedbackReceipt(email: string, createdAt: Date | string) {
    const html = await render(FeedbackReceiptEmail({ createdAt }));
    await sendSupportEmail(email, '[Runich] Обращение принято', html, this.latencyMetrics);
  }

  async sendFeedbackReply(email: string, text: string, createdAt: Date | string) {
    const html = await render(FeedbackReplyEmail({ createdAt, text }));
    const requestDate = formatFeedbackDateTime(createdAt);
    await sendSupportEmail(email, '[Runich] Ответ по обращению от ' + requestDate, html, this.latencyMetrics);
  }
}
