import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { StorageService } from 'src/storage/services/storage.service';
import { ModerationTargetsService } from './moderation-targets.service';
import { EMAIL_NOTIFICATION_JOB_STATUS, EMAIL_NOTIFICATION_TYPE } from 'src/email/email-notification.constants';
import { NOTIFICATION_TYPE } from 'src/notification/notification.constants';
import { createNotificationEvent } from 'src/notification/notification-event';
import type { ContentReportStatus } from '../shared/moderation.types';
import { ModerationActionDto, SubmitContentReportDto } from '../dto/moderation.dto';
import { OPEN_REPORT_STATUSES } from '../shared/moderation.constants';
import { createReportDecisionCopy, createReportReceiptCopy } from '../shared/moderation.utils';
import { ModerationReportsQueryService } from './moderation-reports-query.service';
import { ModerationEmailActionValidationService } from './moderation-email-action-validation.service';
import type { ModerationEmailAction } from '../moderation-email-actions.types';

@Injectable()
export class ModerationReportsService {
  private readonly reportQueries: ModerationReportsQueryService;
  private readonly emailActionValidation: ModerationEmailActionValidationService;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(ModerationTargetsService) private readonly targets: ModerationTargetsService,
    @Optional() @Inject(ModerationReportsQueryService) reportQueries?: ModerationReportsQueryService,
    @Optional()
    @Inject(ModerationEmailActionValidationService)
    emailActionValidation?: ModerationEmailActionValidationService,
  ) {
    this.reportQueries = reportQueries ?? new ModerationReportsQueryService(prisma, storage);
    this.emailActionValidation = emailActionValidation ?? new ModerationEmailActionValidationService(prisma);
  }

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
          reason: request.reason,
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

  async getReportQueue(status?: ContentReportStatus, take = 50) {
    return this.reportQueries.getReportQueue(status, take);
  }

  async getReportDetails(reportId: string) {
    return this.reportQueries.getReportDetails(reportId);
  }

  async validateEmailModerationAction(reportId: string, action: ModerationEmailAction) {
    return this.emailActionValidation.validateEmailModerationAction(reportId, action);
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

  async applyAction(reportId: string, moderatorId: string | null, request: ModerationActionDto) {
    const report = await this.prisma.contentReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Жалоба не найдена');
    if (report.status !== 'open' && report.status !== 'in_review') {
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
    const action = request.action;
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
