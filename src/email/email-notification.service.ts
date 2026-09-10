import { Inject, Injectable, Optional } from '@nestjs/common';
import { render } from '@react-email/components';
import { sendEmail } from 'src/common/email/nodemailer';
import { LatencyMetricsService } from 'src/common/metrics/latency-metrics.service';
import { CommentEmailDTO, CommentLikeEmailDTO, LikeEmailDTO } from './email.dto';
import { NotificationEmail } from './templates';
import { EmailType } from './templates/types';

@Injectable()
export class EmailNotificationService {
  constructor(@Optional() @Inject(LatencyMetricsService) private readonly latencyMetrics?: LatencyMetricsService) {}

  async sendLike(data: LikeEmailDTO & { activityUrl: string }) {
    const html = await render(NotificationEmail({ type: EmailType.like, ...data }));
    return sendEmail(data.recepientEmail, 'Лайк к активности', html, [], this.latencyMetrics);
  }

  async sendComment(data: CommentEmailDTO & { activityUrl: string }) {
    const html = await render(NotificationEmail({ type: EmailType.comment, ...data }));
    return sendEmail(data.recepientEmail, 'Новый комментарий к вашей активности', html, [], this.latencyMetrics);
  }

  async sendCommentLike(data: CommentLikeEmailDTO & { activityUrl: string }) {
    const html = await render(NotificationEmail({ type: EmailType.commentLike, ...data }));
    return sendEmail(data.recepientEmail, 'Лайк к вашему комментарию', html, [], this.latencyMetrics);
  }
}
