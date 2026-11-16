import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { EmailNotificationService } from './email-notification.service';
import { StorageService } from 'src/storage/services/storage.service';
import { EMAIL_NOTIFICATION_TYPE } from './email-notification.constants';
import {
  resolveActivityLikeNotification,
  resolveCommentLikeNotification,
  resolveCommentNotification,
} from './email-notification-social.handlers';
import { resolveGroupJoinRequestNotification } from './email-notification-group.handlers';
import {
  resolveModerationAppealNotification,
  resolveModerationReportNotification,
  resolveReporterDecisionNotification,
  resolveReporterReceiptNotification,
} from './email-notification-moderation.handlers';

export class EmailNotificationResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: EmailNotificationService,
    private readonly storage?: StorageService,
  ) {}

  async resolve(job: { notificationType: string; sourceId: string }) {
    switch (job.notificationType) {
      case EMAIL_NOTIFICATION_TYPE.activityLike:
        return resolveActivityLikeNotification(this.prisma, this.notifications, job.sourceId);
      case EMAIL_NOTIFICATION_TYPE.comment:
        return resolveCommentNotification(this.prisma, this.notifications, job.sourceId);
      case EMAIL_NOTIFICATION_TYPE.commentLike:
        return resolveCommentLikeNotification(this.prisma, this.notifications, job.sourceId);
      case EMAIL_NOTIFICATION_TYPE.groupJoinRequest:
        return resolveGroupJoinRequestNotification(this.prisma, this.notifications, job.sourceId);
      case EMAIL_NOTIFICATION_TYPE.moderationReport:
        return resolveModerationReportNotification(this.prisma, this.notifications, job.sourceId, this.storage);
      case EMAIL_NOTIFICATION_TYPE.reporterReceipt:
        return resolveReporterReceiptNotification(this.prisma, this.notifications, job.sourceId);
      case EMAIL_NOTIFICATION_TYPE.reporterDecision:
        return resolveReporterDecisionNotification(this.prisma, this.notifications, job.sourceId);
      case EMAIL_NOTIFICATION_TYPE.moderationAppeal:
        return resolveModerationAppealNotification(this.prisma, this.notifications, job.sourceId);
      default:
        return null;
    }
  }
}
