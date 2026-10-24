import { Inject, Injectable, Optional } from '@nestjs/common';
import { render } from '@react-email/components';
import { sendEmail } from 'src/common/email/nodemailer';
import { LatencyMetricsService } from 'src/common/metrics/latency-metrics.service';
import { getAuthFrontendRedirectUri } from 'src/common/config/environment';
import { NotificationEmail } from './templates';
import { ModerationReportEmail, type ModerationReportEmailProps } from './templates/ModerationReportEmail';
import { ReporterModerationEmail, type ReporterModerationEmailProps } from './templates/ReporterModerationEmail';
import { EmailType } from './templates/types';
import { MODERATION_EMAIL_RECIPIENT, getModerationReportTitle } from './email-notification.constants';

export interface EmailNotificationPayload {
  activityId: string;
  actorName?: string | null;
  actorSurname?: string | null;
  actorProfilePhoto?: string | null;
  recipientEmail: string;
  recipientName?: string | null;
  recipientSurname?: string | null;
  mapPhotoUrl?: string | null;
  comment?: string;
}

@Injectable()
export class EmailNotificationService {
  constructor(@Optional() @Inject(LatencyMetricsService) private readonly latencyMetrics?: LatencyMetricsService) {}

  sendLike(payload: EmailNotificationPayload) {
    return this.send(payload, EmailType.like, 'Лайк к активности');
  }

  sendComment(payload: EmailNotificationPayload) {
    return this.send(payload, EmailType.comment, 'Новый комментарий к вашей активности');
  }

  sendCommentLike(payload: EmailNotificationPayload) {
    return this.send(payload, EmailType.commentLike, 'Лайк к вашему комментарию');
  }

  async sendModerationUpdate(payload: ModerationReportEmailProps) {
    const subject =
      payload.requestType === 'appeal'
        ? '[Runich] Новая апелляция'
        : `[Runich] ${getModerationReportTitle(payload.targetType)}`;
    const html = await render(ModerationReportEmail(payload));
    return sendEmail(MODERATION_EMAIL_RECIPIENT, subject, html, [], this.latencyMetrics);
  }

  async sendReporterModerationUpdate(payload: ReporterModerationEmailProps) {
    const subject =
      payload.locale === 'russian'
        ? `[Runich] ${payload.requestType === 'received' ? 'Жалоба принята' : 'Решение по жалобе'}`
        : `[Runich] ${payload.requestType === 'received' ? 'Report received' : 'Report decision'}`;
    const html = await render(ReporterModerationEmail(payload));
    return sendEmail(MODERATION_EMAIL_RECIPIENT, subject, html, [], this.latencyMetrics);
  }

  private async send(payload: EmailNotificationPayload, type: EmailType, subject: string) {
    const activityUrl = new URL(getAuthFrontendRedirectUri());
    activityUrl.pathname = `/activity/${encodeURIComponent(payload.activityId)}`;
    activityUrl.search = '';
    activityUrl.hash = '';

    const html = await render(
      NotificationEmail({
        type,
        name: payload.actorName ?? '',
        surname: payload.actorSurname ?? '',
        profilePhoto: payload.actorProfilePhoto ?? '',
        recepientName: payload.recipientName ?? '',
        recepientSurname: payload.recipientSurname ?? '',
        mapPhotoUrl: payload.mapPhotoUrl ?? '',
        activityUrl: activityUrl.toString(),
        comment: payload.comment,
      }),
    );
    return sendEmail(payload.recipientEmail, subject, html, [], this.latencyMetrics);
  }
}
