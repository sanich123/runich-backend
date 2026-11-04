import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { StorageService } from 'src/storage/services/storage.service';
import { ModerationTargetsService } from './moderation-targets.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EMAIL_NOTIFICATION_JOB_STATUS, EMAIL_NOTIFICATION_TYPE } from 'src/email/email-notification.constants';
import { NOTIFICATION_TYPE } from 'src/notification/notification.constants';
import { createNotificationEvent } from 'src/notification/notification-event';
import { ContentReportReason, ContentReportStatus, ModerationActionType } from '../shared/moderation.types';
import { ModerationActionDto, SubmitContentReportDto } from '../dto/moderation.dto';
import { ACTIVE_QUEUE_STATUSES, OPEN_REPORT_STATUSES } from '../shared/moderation.constants';
import { createReportDecisionCopy, createReportReceiptCopy } from '../shared/moderation.utils';

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
      },
    });
    return reports;
  }

  async getReportDetails(reportId: string) {
    const report = await this.prisma.contentReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Жалоба не найдена');

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
    } else if (report.targetType === 'media') {
      context = await this.prisma.activityMedia.findUnique({
        where: { id: report.targetId },
        select: { url: true, thumbnail: true, userId: true, activityId: true, moderationStatus: true },
      });
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
        select: { name: true, surname: true, profilePhoto: true, userId: true },
      });
    }
    const actions = await this.prisma.moderationAction.findMany({
      where: { reportId },
      orderBy: { createdAt: 'asc' },
    });
    return { report, context, actions };
  }

  async applyAction(reportId: string, moderatorId: string, request: ModerationActionDto) {
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
    if (action === 'approve_media') {
      await this.storage.approveModerationAsset(report.targetId, moderatorId, request.note);
    }
    if (action === 'reject_media') {
      await this.storage.rejectModerationAsset(report.targetId, moderatorId, request.note);
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
      await createNotificationEvent(transaction, {
        recipientUserId: report.reporterId ?? '',
        type: NOTIFICATION_TYPE.moderationReportDecision,
        emailNotificationType: EMAIL_NOTIFICATION_TYPE.reporterDecision,
        sourceId: moderationAction.id,
        targetType: 'moderation-report',
        targetId: report.id,
        localizedContent: createReportDecisionCopy(report, action),
        mandatory: true,
      });
    });

    return await this.prisma.contentReport.findUnique({ where: { id: reportId } });
  }
}
