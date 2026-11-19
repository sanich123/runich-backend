import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { StorageService } from 'src/storage/services/storage.service';
import { ModerationTargetsService } from './moderation-targets.service';
import { EMAIL_NOTIFICATION_JOB_STATUS, EMAIL_NOTIFICATION_TYPE } from 'src/email/email-notification.constants';
import { NOTIFICATION_TYPE } from 'src/notification/notification.constants';
import { createNotificationEvent } from 'src/notification/notification-event';
import { ContentReportReason, ContentReportStatus, ModerationActionType } from '../shared/moderation.types';
import { ModerationActionDto, SubmitContentReportDto } from '../dto/moderation.dto';
import { ACTIVE_QUEUE_STATUSES, OPEN_REPORT_STATUSES } from '../shared/moderation.constants';
import { createReportDecisionCopy, createReportReceiptCopy } from '../shared/moderation.utils';
import type { ReportQueueRow } from './moderation-reports.types';
import { getAvailableModerationEmailActions } from '../moderation-email-actions.policy';
import type { ModerationEmailAction } from '../moderation-email-actions.types';

@Injectable()
export class ModerationReportsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(ModerationTargetsService) private readonly targets: ModerationTargetsService,
  ) {}

  async submitReport(reporterId: string, request: SubmitContentReportDto) {
    const target = await this.targets.resolveReportTarget(request.targetType, request.targetId);
    if (!target) throw new NotFoundException('Контент не найден');
    if (target.subjectUserId === reporterId) throw new BadRequestException('Нельзя пожаловаться на свой контент');

    const duplicate = await this.prisma.contentReport.findFirst({
      where: {
        reporterId,
        targetType: request.targetType,
        targetId: request.targetId,
        status: { in: OPEN_REPORT_STATUSES },
      },
      select: { id: true, status: true, createdAt: true },
    });
    if (duplicate) return duplicate;

    return await this.prisma.$transaction(async (transaction) => {
      const report = await transaction.contentReport.create({
        data: {
          reporterId,
          targetType: request.targetType,
          targetId: request.targetId,
          ...(target.activityId ? { activityId: target.activityId } : {}),
          ...(target.commentId ? { commentId: target.commentId } : {}),
          ...(target.groupPostId ? { groupPostId: target.groupPostId } : {}),
          ...(target.mediaId ? { mediaId: target.mediaId } : {}),
          ...(target.targetUserId ? { targetUserId: target.targetUserId } : {}),
          subjectUserId: target.subjectUserId,
          reason: request.reason as ContentReportReason,
          details: request.details?.trim() || null,
        },
        select: { id: true, status: true, createdAt: true },
      });
      await transaction.emailNotificationJob.create({
        data: {
          notificationType: EMAIL_NOTIFICATION_TYPE.moderationReport,
          sourceId: report.id,
          status: EMAIL_NOTIFICATION_JOB_STATUS.queued,
        },
      });
      await createNotificationEvent(transaction, {
        recipientUserId: reporterId,
        type: NOTIFICATION_TYPE.moderationReportReceived,
        emailNotificationType: EMAIL_NOTIFICATION_TYPE.reporterReceipt,
        sourceId: report.id,
        targetType: 'moderation-report',
        targetId: report.id,
        localizedContent: createReportReceiptCopy({
          id: report.id,
          targetType: request.targetType,
          reason: request.reason,
        }),
        mandatory: true,
      });
      return report;
    });
  }

  async getReportQueue(status?: string, take = 50) {
    const reportStatus = status as ContentReportStatus | undefined;
    const reports = await this.prisma.contentReport.findMany({
      where: { status: reportStatus ?? { in: ACTIVE_QUEUE_STATUSES } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take,
      select: {
        id: true,
        reporterId: true,
        targetType: true,
        targetId: true,
        subjectUserId: true,
        reason: true,
        details: true,
        status: true,
        priority: true,
        assignedModeratorId: true,
        createdAt: true,
        reviewedAt: true,
        activity: { select: { title: true, description: true } },
        comment: { select: { comment: true } },
        groupPost: { select: { text: true } },
      },
    });
    return reports.map(({ activity, comment, groupPost, ...report }: ReportQueueRow) => ({
      ...report,
      contextPreview:
        comment?.comment ??
        groupPost?.text ??
        (activity
          ? [activity.title, activity.description].filter((part): part is string => Boolean(part)).join('\n\n')
          : null),
    }));
  }

  async getReportDetails(reportId: string) {
    const report = await this.prisma.contentReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Жалоба не найдена');

    const [reporter, contentAuthor] = await Promise.all([
      this.getUserSummary(report.reporterId),
      this.getUserSummary(report.subjectUserId),
    ]);

    let context: Record<string, unknown> | null;
    if (report.targetType === 'activity') {
      context = await this.prisma.activity.findUnique({
        where: { id: report.targetId },
        select: {
          title: true,
          description: true,
          userId: true,
          moderationStatus: true,
          media: {
            orderBy: { position: 'asc' },
            select: { id: true, url: true, thumbnail: true },
          },
        },
      });
    } else if (report.targetType === 'comment') {
      context = await this.prisma.comment.findUnique({
        where: { id: report.targetId },
        select: { comment: true, authorId: true, activityId: true, moderationStatus: true },
      });
    } else if (report.targetType === 'activity_text') {
      const activity = await this.prisma.activity.findUnique({
        where: { id: report.targetId },
        select: { title: true, description: true, userId: true, textModerationStatus: true },
      });
      context = activity ? { ...activity, moderationStatus: activity.textModerationStatus } : null;
    } else if (report.targetType === 'group_post') {
      const post = await this.prisma.groupPost.findUnique({
        where: { id: report.targetId },
        select: {
          text: true,
          createdByUserId: true,
          moderationStatus: true,
          photoAsset: {
            select: {
              quarantineKey: true,
              publishedKey: true,
              status: true,
              contentType: true,
              scores: true,
              frameCount: true,
              modelVersion: true,
            },
          },
        },
      });
      const photoAsset = post?.photoAsset;
      const mediaUrl = photoAsset
        ? photoAsset.status === 'approved' && photoAsset.publishedKey
          ? this.storage.getPublicUrl(photoAsset.publishedKey)
          : await this.storage.getQuarantinePreviewUrl(photoAsset.quarantineKey)
        : null;
      context = post
        ? {
            comment: post.text,
            authorId: post.createdByUserId,
            moderationStatus: post.moderationStatus,
            url: mediaUrl,
            mediaStatus: photoAsset?.status ?? null,
            contentType: photoAsset?.contentType ?? null,
            scores: photoAsset?.scores ?? null,
            frameCount: photoAsset?.frameCount ?? null,
            modelVersion: photoAsset?.modelVersion ?? null,
          }
        : null;
    } else if (report.targetType === 'media') {
      const media = await this.prisma.activityMedia.findUnique({
        where: { id: report.targetId },
        select: {
          url: true,
          thumbnail: true,
          userId: true,
          activityId: true,
          moderationStatus: true,
          mediaReviewStatus: true,
          mediaModerationAsset: {
            select: {
              quarantineKey: true,
              publishedKey: true,
              status: true,
              contentType: true,
              scores: true,
              frameCount: true,
              modelVersion: true,
            },
          },
        },
      });
      const mediaAsset = media?.mediaModerationAsset;
      const mediaUrl =
        media?.url ??
        (mediaAsset
          ? mediaAsset.status === 'approved' && mediaAsset.publishedKey
            ? this.storage.getPublicUrl(mediaAsset.publishedKey)
            : await this.storage.getQuarantinePreviewUrl(mediaAsset.quarantineKey)
          : null);
      context = media
        ? {
            ...media,
            url: mediaUrl,
            mediaStatus: mediaAsset?.status ?? media.mediaReviewStatus ?? null,
            contentType: mediaAsset?.contentType ?? null,
            scores: mediaAsset?.scores ?? null,
            frameCount: mediaAsset?.frameCount ?? null,
            modelVersion: mediaAsset?.modelVersion ?? null,
          }
        : null;
    } else if (report.targetType === 'group') {
      const group = await this.prisma.group.findUnique({
        where: { id: report.targetId },
        select: {
          name: true,
          description: true,
          createdByUserId: true,
          moderationStatus: true,
          photoAsset: { select: { status: true, publishedKey: true } },
        },
      });
      context = group
        ? {
            title: group.name,
            name: group.name,
            description: group.description,
            authorId: group.createdByUserId,
            moderationStatus: group.moderationStatus,
            url:
              group.photoAsset?.status === 'approved' && group.photoAsset.publishedKey
                ? this.storage.getPublicUrl(group.photoAsset.publishedKey)
                : null,
          }
        : null;
    } else if (report.targetType === 'media_upload') {
      const asset = await this.prisma.mediaModerationAsset.findUnique({ where: { id: report.targetId } });
      context = asset
        ? {
            url: await this.storage.getQuarantinePreviewUrl(asset.quarantineKey),
            userId: asset.ownerId,
            moderationStatus: asset.status,
            scores: asset.scores,
            frameCount: asset.frameCount,
            modelVersion: asset.modelVersion,
            contentType: asset.contentType,
          }
        : null;
    } else {
      context = await this.prisma.profile.findUnique({
        where: { userId: report.targetId },
        select: { name: true, surname: true, profilePhoto: true, userId: true, bio: true },
      });
    }
    const actions = await this.prisma.moderationAction.findMany({
      where: { reportId },
      orderBy: { createdAt: 'asc' },
    });
    return { report, reporter, contentAuthor, context, actions };
  }

  async validateEmailModerationAction(reportId: string, action: ModerationEmailAction) {
    const report = await this.prisma.contentReport.findUnique({
      where: { id: reportId },
      select: { targetType: true, targetId: true, status: true },
    });
    if (!report) throw new NotFoundException('Жалоба не найдена');
    if (report.status !== 'open' && report.status !== 'in_review') {
      throw new ConflictException('Это действие уже недоступно');
    }

    const moderationStatus = await this.getEmailActionTargetStatus(report.targetType, report.targetId);
    if (moderationStatus === null) {
      throw new ConflictException('Это действие уже недоступно');
    }
    const availableActions = getAvailableModerationEmailActions(report.targetType, report.status, moderationStatus);
    if (!availableActions.includes(action)) {
      throw new ConflictException('Это действие уже недоступно');
    }
    return report.targetType;
  }

  private async getEmailActionTargetStatus(targetType: string, targetId: string): Promise<string | null> {
    if (targetType === 'activity') {
      const activity = await this.prisma.activity.findUnique({
        where: { id: targetId },
        select: { moderationStatus: true },
      });
      return activity?.moderationStatus ?? null;
    }
    if (targetType === 'activity_text') {
      const activity = await this.prisma.activity.findUnique({
        where: { id: targetId },
        select: { textModerationStatus: true },
      });
      return activity?.textModerationStatus ?? null;
    }
    if (targetType === 'comment') {
      const comment = await this.prisma.comment.findUnique({
        where: { id: targetId },
        select: { moderationStatus: true },
      });
      return comment?.moderationStatus ?? null;
    }
    if (targetType === 'group_post') {
      const post = await this.prisma.groupPost.findUnique({
        where: { id: targetId },
        select: { moderationStatus: true },
      });
      return post?.moderationStatus ?? null;
    }
    if (targetType === 'media') {
      const media = await this.prisma.activityMedia.findUnique({
        where: { id: targetId },
        select: { moderationStatus: true },
      });
      return media?.moderationStatus ?? null;
    }
    if (targetType === 'media_upload') {
      const asset = await this.prisma.mediaModerationAsset.findUnique({
        where: { id: targetId },
        select: { status: true },
      });
      return asset?.status ?? null;
    }
    if (targetType === 'group') {
      const group = await this.prisma.group.findUnique({
        where: { id: targetId },
        select: { moderationStatus: true },
      });
      return group?.moderationStatus ?? null;
    }
    if (targetType === 'user') {
      const user = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
      return user ? 'active' : null;
    }
    return null;
  }

  async deleteReport(reportId: string) {
    const report = await this.prisma.contentReport.findUnique({ where: { id: reportId }, select: { id: true } });
    if (!report) throw new NotFoundException('Жалоба не найдена');

    await this.prisma.$transaction(async (transaction) => {
      await transaction.moderationAppeal.deleteMany({ where: { reportId } });
      await transaction.moderationAction.deleteMany({ where: { reportId } });
      await transaction.contentReport.delete({ where: { id: reportId } });
    });
  }

  private async getUserSummary(userId: string | null) {
    if (!userId) return null;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, profile: { select: { name: true, surname: true, profilePhoto: true } } },
    });
    if (!user) return null;

    return {
      userId,
      name: user.profile?.name ?? null,
      surname: user.profile?.surname ?? null,
      profilePhoto: user.profile?.profilePhoto ?? null,
      email: user.email,
    };
  }

  async applyAction(reportId: string, moderatorId: string | null, request: ModerationActionDto) {
    const report = await this.prisma.contentReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Жалоба не найдена');
    if (!OPEN_REPORT_STATUSES.includes(report.status as ContentReportStatus)) {
      throw new ConflictException('Жалоба уже рассмотрена или обжалуется');
    }
    if (['appeal_submitted', 'appeal_upheld', 'appeal_rejected'].includes(request.action)) {
      throw new BadRequestException('Это действие применяется через API обжалований');
    }
    if (['approve_media', 'reject_media'].includes(request.action) && report.targetType !== 'media_upload') {
      throw new BadRequestException('Это действие доступно только для загруженного медиафайла');
    }
    if (report.targetType === 'media_upload' && !['approve_media', 'reject_media'].includes(request.action)) {
      throw new BadRequestException('Для медиафайла выберите одобрение или отклонение');
    }
    if (request.action === 'temporary_suspend' && !request.suspensionDays) {
      throw new BadRequestException('Укажите срок временной блокировки');
    }

    const reviewedAt = new Date();
    const action = request.action as ModerationActionType;
    if (action === 'approve_media' || action === 'reject_media') {
      const asset = await this.prisma.mediaModerationAsset.findUnique({
        where: { id: report.targetId },
        select: { status: true },
      });
      if (asset?.status !== 'review_required') {
        throw new BadRequestException('Этот файл больше не ожидает решения модератора');
      }
    }
    if (action === 'approve_media') {
      await this.storage.approveModerationAsset(report.targetId, moderatorId ?? undefined, request.note);
    }
    if (action === 'reject_media') {
      await this.storage.rejectModerationAsset(report.targetId, moderatorId ?? undefined, request.note);
    }
    await this.prisma.$transaction(async (transaction) => {
      if (action === 'hide_content' || action === 'remove_content' || action === 'restore_content') {
        await this.targets.updateTargetModerationStatus(transaction, report, this.targets.getContentStatus(action));
      } else if (action === 'temporary_suspend' || action === 'permanent_suspend') {
        if (!report.subjectUserId) throw new BadRequestException('У жалобы нет целевого пользователя');
        const bannedUntil =
          action === 'permanent_suspend'
            ? new Date('9999-12-31T23:59:59.999Z')
            : new Date(reviewedAt.getTime() + request.suspensionDays! * 24 * 60 * 60 * 1000);
        await transaction.user.update({ where: { id: report.subjectUserId }, data: { bannedUntil } });
      }

      const moderationAction = await transaction.moderationAction.create({
        data: { reportId, actorId: moderatorId, action, note: request.note?.trim() || null },
      });
      const updatedReport = await transaction.contentReport.updateMany({
        where: { id: reportId, status: { in: OPEN_REPORT_STATUSES } },
        data: {
          status: action === 'reject_report' ? 'rejected' : 'resolved',
          assignedModeratorId: moderatorId,
          reviewedAt,
        },
      });
      if (updatedReport.count !== 1) throw new ConflictException('Жалоба уже рассмотрена');
      if (report.reporterId) {
        await createNotificationEvent(transaction, {
          recipientUserId: report.reporterId,
          type: NOTIFICATION_TYPE.moderationReportDecision,
          emailNotificationType: EMAIL_NOTIFICATION_TYPE.reporterDecision,
          sourceId: moderationAction.id,
          targetType: 'moderation-report',
          targetId: report.id,
          localizedContent: createReportDecisionCopy(report, action),
          mandatory: true,
        });
      }
    });

    return await this.prisma.contentReport.findUnique({ where: { id: reportId } });
  }
}
