import { Inject, Injectable, Logger } from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ACTIVITY_MIGRATION_CONFIG } from 'src/activity/activity-migration-config';
import { EmailNotificationService, type EmailNotificationPayload } from './email-notification.service';
import { EMAIL_NOTIFICATION_JOB_STATUS, EMAIL_NOTIFICATION_TYPE } from './email-notification.constants';

const MAX_ATTEMPTS = 5;
const STALE_JOB_AGE_MS = 15 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;

@Injectable()
export class EmailNotificationWorkerService {
  private readonly logger = new Logger(EmailNotificationWorkerService.name);
  private readonly pollIntervalMs = ACTIVITY_MIGRATION_CONFIG.workerPollIntervalMs;
  private stopRequested = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmailNotificationService) private readonly notifications: EmailNotificationService,
  ) {}

  requestStop() {
    this.stopRequested = true;
  }

  async processNextJob() {
    const job = await this.prisma.emailNotificationJob.findFirst({
      where: { status: EMAIL_NOTIFICATION_JOB_STATUS.queued, availableAt: { lte: new Date() } },
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
    });
    if (!job) return false;

    const claimed = await this.prisma.emailNotificationJob.updateMany({
      where: { id: job.id, status: EMAIL_NOTIFICATION_JOB_STATUS.queued },
      data: {
        status: EMAIL_NOTIFICATION_JOB_STATUS.processing,
        attempts: job.attempts + 1,
        startedAt: new Date(),
        finishedAt: null,
        errorMessage: null,
      },
    });
    if (claimed.count === 0) return true;

    const attempts = job.attempts + 1;
    try {
      const notification = await this.resolveNotification(job);
      if (!notification) {
        await this.prisma.emailNotificationJob.update({
          where: { id: job.id },
          data: { status: EMAIL_NOTIFICATION_JOB_STATUS.skipped, finishedAt: new Date(), startedAt: null },
        });
        return true;
      }

      await notification.send();
      await this.prisma.emailNotificationJob.update({
        where: { id: job.id },
        data: { status: EMAIL_NOTIFICATION_JOB_STATUS.sent, finishedAt: new Date(), startedAt: null },
      });
    } catch (error) {
      await this.scheduleRetry(job.id, attempts, error);
    }

    return true;
  }

  async runWorker() {
    this.stopRequested = false;
    await this.requeueInterruptedJobs();
    this.logger.log(`Worker email-уведомлений запущен: poll=${this.pollIntervalMs}ms`);

    while (!this.stopRequested) {
      try {
        const foundJob = await this.processNextJob();
        if (!foundJob) await delay(this.pollIntervalMs);
      } catch (error) {
        this.logger.error('Ошибка цикла worker email-уведомлений', this.getErrorMessage(error));
        await delay(this.pollIntervalMs);
      }
    }

    this.logger.log('Worker email-уведомлений остановлен');
  }

  private async resolveNotification(job: { notificationType: string; sourceId: string }) {
    switch (job.notificationType) {
      case EMAIL_NOTIFICATION_TYPE.activityLike: {
        const like = await this.prisma.like.findUnique({
          where: { id: job.sourceId },
          select: {
            authorId: true,
            profile: { select: { name: true, surname: true, profilePhoto: true } },
            activity: {
              select: {
                id: true,
                userId: true,
                mapPhotoUrl: true,
                profile: {
                  select: {
                    userId: true,
                    name: true,
                    surname: true,
                    emailNotifications: true,
                    user: { select: { email: true } },
                  },
                },
              },
            },
          },
        });
        if (!like || like.authorId === like.activity.userId) return null;
        const payload = this.createPayload(like.profile, like.activity.profile, like.activity.id, {
          mapPhotoUrl: like.activity.mapPhotoUrl,
        });
        return payload ? { send: () => this.notifications.sendLike(payload) } : null;
      }
      case EMAIL_NOTIFICATION_TYPE.comment: {
        const comment = await this.prisma.comment.findUnique({
          where: { id: job.sourceId },
          select: {
            authorId: true,
            comment: true,
            profile: { select: { name: true, surname: true, profilePhoto: true } },
            activity: {
              select: {
                id: true,
                userId: true,
                mapPhotoUrl: true,
                profile: {
                  select: {
                    userId: true,
                    name: true,
                    surname: true,
                    emailNotifications: true,
                    user: { select: { email: true } },
                  },
                },
              },
            },
          },
        });
        if (!comment || comment.authorId === comment.activity.userId) return null;
        const payload = this.createPayload(comment.profile, comment.activity.profile, comment.activity.id, {
          comment: comment.comment,
          mapPhotoUrl: comment.activity.mapPhotoUrl,
        });
        return payload ? { send: () => this.notifications.sendComment(payload) } : null;
      }
      case EMAIL_NOTIFICATION_TYPE.commentLike: {
        const commentLike = await this.prisma.commentLike.findUnique({
          where: { id: job.sourceId },
          select: {
            authorId: true,
            profile: { select: { name: true, surname: true, profilePhoto: true } },
            comment: {
              select: {
                authorId: true,
                comment: true,
                profile: {
                  select: {
                    userId: true,
                    name: true,
                    surname: true,
                    emailNotifications: true,
                    user: { select: { email: true } },
                  },
                },
                activity: { select: { id: true } },
              },
            },
          },
        });
        if (!commentLike || commentLike.authorId === commentLike.comment.authorId) return null;
        const payload = this.createPayload(
          commentLike.profile,
          commentLike.comment.profile,
          commentLike.comment.activity.id,
          { comment: commentLike.comment.comment },
        );
        return payload ? { send: () => this.notifications.sendCommentLike(payload) } : null;
      }
      case EMAIL_NOTIFICATION_TYPE.moderationReport: {
        const report = await this.prisma.contentReport.findUnique({
          where: { id: job.sourceId },
          select: {
            id: true,
            targetId: true,
            targetType: true,
            reason: true,
            details: true,
            reporterId: true,
            subjectUserId: true,
            reporter: { select: { id: true, email: true, profile: { select: { name: true, surname: true } } } },
            subjectUser: {
              select: {
                id: true,
                email: true,
                profile: { select: { name: true, surname: true, bio: true, profilePhoto: true } },
              },
            },
            activity: { select: { title: true, description: true } },
            comment: { select: { comment: true } },
            media: { select: { url: true, thumbnail: true, mediaReviewStatus: true } },
            mediaUpload: {
              select: {
                owner: {
                  select: {
                    id: true,
                    email: true,
                    profile: { select: { name: true, surname: true, bio: true, profilePhoto: true } },
                  },
                },
              },
            },
          },
        });
        if (!report) return null;
        const reportedContent =
          report.targetType === 'activity'
            ? [report.activity?.title, report.activity?.description].filter(Boolean).join('\n') || null
            : report.targetType === 'comment'
              ? (report.comment?.comment ?? null)
              : report.targetType === 'user'
                ? (report.subjectUser?.profile?.bio ?? null)
                : null;
        const contentAuthor = report.subjectUser ?? report.mediaUpload?.owner;
        const payload = {
          reportId: report.id,
          requestType: 'report' as const,
          targetType: report.targetType,
          targetId: report.targetId,
          reason: report.reason,
          reporterDetails: report.details,
          reporter: report.reporter
            ? {
                id: report.reporter.id,
                email: report.reporter.email,
                name: report.reporter.profile?.name,
                surname: report.reporter.profile?.surname,
              }
            : report.reporterId
              ? { id: report.reporterId }
              : null,
          reportedUser: contentAuthor
            ? {
                id: contentAuthor.id,
                email: contentAuthor.email,
                name: contentAuthor.profile?.name,
                surname: contentAuthor.profile?.surname,
              }
            : report.subjectUserId
              ? { id: report.subjectUserId }
              : null,
          reportedContent,
          reportedMediaUrl:
            report.media?.mediaReviewStatus === 'rejected'
              ? null
              : (report.media?.thumbnail ?? report.media?.url ?? null),
          reportedProfile: report.targetType === 'user' ? (report.subjectUser?.profile ?? null) : null,
        };
        return { send: () => this.notifications.sendModerationUpdate(payload) };
      }
      case EMAIL_NOTIFICATION_TYPE.reporterReceipt: {
        const report = await this.prisma.contentReport.findUnique({
          where: { id: job.sourceId },
          select: {
            id: true,
            targetType: true,
            reason: true,
            reporter: {
              select: {
                profile: { select: { language: true } },
              },
            },
          },
        });
        const reporter = report?.reporter;
        if (!report || !reporter) return null;
        const locale: 'russian' | 'english' = reporter.profile?.language === 'russian' ? 'russian' : 'english';
        const payload = {
          reportId: report.id,
          targetType: report.targetType,
          reason: report.reason,
          requestType: 'received' as const,
          locale,
        };
        return { send: () => this.notifications.sendReporterModerationUpdate(payload) };
      }
      case EMAIL_NOTIFICATION_TYPE.reporterDecision: {
        const action = await this.prisma.moderationAction.findUnique({
          where: { id: job.sourceId },
          select: {
            action: true,
            report: {
              select: {
                id: true,
                targetType: true,
                reason: true,
                reporter: {
                  select: {
                    profile: { select: { language: true } },
                  },
                },
              },
            },
          },
        });
        const report = action?.report;
        const reporter = report?.reporter;
        if (!action || !report || !reporter) return null;
        const locale: 'russian' | 'english' = reporter.profile?.language === 'russian' ? 'russian' : 'english';
        const payload = {
          reportId: report.id,
          targetType: report.targetType,
          reason: report.reason,
          requestType: 'decision' as const,
          locale,
          outcome:
            action.action === 'reject_report'
              ? ('not-confirmed' as const)
              : action.action === 'restore_content'
                ? ('content-restored' as const)
                : ('confirmed' as const),
        };
        return { send: () => this.notifications.sendReporterModerationUpdate(payload) };
      }
      case EMAIL_NOTIFICATION_TYPE.moderationAppeal: {
        const appeal = await this.prisma.moderationAppeal.findUnique({
          where: { id: job.sourceId },
          select: { report: { select: { id: true, targetType: true } } },
        });
        if (!appeal) return null;
        const payload = {
          reportId: appeal.report.id,
          appealId: job.sourceId,
          requestType: 'appeal' as const,
          targetType: appeal.report.targetType,
          reason: 'appeal',
        };
        return { send: () => this.notifications.sendModerationUpdate(payload) };
      }
      default:
        return null;
    }
  }

  private createPayload(
    actor: { name?: string | null; surname?: string | null; profilePhoto?: string | null } | null,
    recipient: {
      userId: string;
      name?: string | null;
      surname?: string | null;
      emailNotifications?: boolean | null;
      user?: { email?: string | null } | null;
    } | null,
    activityId: string,
    extra: { comment?: string; mapPhotoUrl?: string | null } = {},
  ): EmailNotificationPayload | null {
    if (!actor || !recipient || recipient.emailNotifications !== true || !recipient.user?.email) return null;

    return {
      activityId,
      actorName: actor.name,
      actorSurname: actor.surname,
      actorProfilePhoto: actor.profilePhoto,
      recipientEmail: recipient.user.email,
      recipientName: recipient.name,
      recipientSurname: recipient.surname,
      ...extra,
    };
  }

  private async scheduleRetry(jobId: string, attempts: number, error: unknown) {
    const finished = attempts >= MAX_ATTEMPTS;
    const retryDelay = Math.min(30_000 * 2 ** (attempts - 1), MAX_RETRY_DELAY_MS);
    const errorMessage = this.getErrorMessage(error).slice(0, 1000);
    await this.prisma.emailNotificationJob.update({
      where: { id: jobId },
      data: {
        status: finished ? EMAIL_NOTIFICATION_JOB_STATUS.failed : EMAIL_NOTIFICATION_JOB_STATUS.queued,
        availableAt: finished ? new Date() : new Date(Date.now() + retryDelay),
        startedAt: null,
        finishedAt: finished ? new Date() : null,
        errorMessage,
      },
    });
    this.logger.error(
      finished ? `Email notification job ${jobId} failed permanently` : `Email notification job ${jobId} will retry`,
      errorMessage,
    );
  }

  private async requeueInterruptedJobs() {
    await this.prisma.emailNotificationJob.updateMany({
      where: {
        status: EMAIL_NOTIFICATION_JOB_STATUS.processing,
        startedAt: { lt: new Date(Date.now() - STALE_JOB_AGE_MS) },
      },
      data: {
        status: EMAIL_NOTIFICATION_JOB_STATUS.queued,
        startedAt: null,
        finishedAt: null,
        availableAt: new Date(),
        errorMessage: 'Worker перезапущен во время отправки',
      },
    });
  }

  private getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
