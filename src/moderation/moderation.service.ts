import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { EMAIL_NOTIFICATION_JOB_STATUS, EMAIL_NOTIFICATION_TYPE } from 'src/email/email-notification.constants';
import { MODERATOR_EMAILS } from './moderation.constants';
import { StorageService } from 'src/storage/storage.service';
import type {
  ContentReportReason,
  ContentReportStatus,
  ContentReportTargetType,
  ModerationActionType,
} from './moderation.constants';
import type { ModerationActionDto, ModerationAppealDecisionDto, SubmitContentReportDto } from './moderation.dto';

const OPEN_REPORT_STATUSES: ContentReportStatus[] = ['open', 'in_review'];
const ACTIVE_QUEUE_STATUSES: ContentReportStatus[] = ['open', 'in_review', 'appealed'];
const MAX_BLOCKED_USERS = 500;

type ModerationTarget = {
  targetType: ContentReportTargetType;
  targetId: string;
  subjectUserId: string;
  activityId?: string;
  commentId?: string;
  mediaId?: string;
  targetUserId?: string;
};

@Injectable()
export class ModerationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async getModeratorAccess(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailConfirmedAt: true },
    });
    const email = user?.email?.trim().toLowerCase();
    return { isModerator: Boolean(email && user?.emailConfirmedAt && MODERATOR_EMAILS.has(email)) };
  }

  async submitReport(reporterId: string, request: SubmitContentReportDto) {
    const target = await this.resolveReportTarget(request.targetType, request.targetId);
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
      return report;
    });
  }

  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) throw new BadRequestException('Нельзя заблокировать себя');
    const blockedUser = await this.prisma.user.findUnique({ where: { id: blockedId }, select: { id: true } });
    if (!blockedUser) throw new NotFoundException('Пользователь не найден');

    await this.prisma.$transaction(async (transaction) => {
      await transaction.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId, blockedId } },
        create: { blockerId, blockedId },
        update: {},
      });
      await transaction.friend.deleteMany({
        where: {
          OR: [
            { userId: blockerId, friendId: blockedId },
            { userId: blockedId, friendId: blockerId },
          ],
        },
      });
    });
  }

  async unblockUser(blockerId: string, blockedId: string) {
    await this.prisma.userBlock.deleteMany({ where: { blockerId, blockedId } });
  }

  async getBlockedUsers(blockerId: string) {
    const blocks = await this.prisma.userBlock.findMany({
      where: { blockerId },
      orderBy: { createdAt: 'desc' },
      take: MAX_BLOCKED_USERS,
      select: { blockedId: true, createdAt: true },
    });
    if (!blocks.length) return { items: [] };

    const userIds = blocks.map(({ blockedId }: { blockedId: string }) => blockedId);
    const profiles = await this.prisma.profile.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, name: true, surname: true, profilePhoto: true, profilePhotoBlurhash: true },
    });
    const profileByUserId = new Map(profiles.map((profile: Record<string, unknown>) => [profile.userId, profile]));
    return {
      items: blocks.map(({ blockedId, createdAt }: { blockedId: string; createdAt: Date }) => ({
        blockedUserId: blockedId,
        createdAt,
        profile: profileByUserId.get(blockedId) ?? null,
      })),
    };
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
        select: { title: true, description: true, userId: true, moderationStatus: true },
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
        await this.updateTargetModerationStatus(transaction, report, this.getContentStatus(action));
      } else if (action === 'temporary_suspend' || action === 'permanent_suspend') {
        if (!report.subjectUserId) throw new BadRequestException('У жалобы нет целевого пользователя');
        const bannedUntil =
          action === 'permanent_suspend'
            ? new Date('9999-12-31T23:59:59.999Z')
            : new Date(reviewedAt.getTime() + request.suspensionDays! * 24 * 60 * 60 * 1000);
        await transaction.user.update({ where: { id: report.subjectUserId }, data: { bannedUntil } });
      }

      await transaction.moderationAction.create({
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
    });

    return await this.prisma.contentReport.findUnique({ where: { id: reportId } });
  }

  async submitAppeal(reportId: string, appellantId: string, reason: string) {
    const report = await this.prisma.contentReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Жалоба не найдена');
    if (report.subjectUserId !== appellantId)
      throw new ForbiddenException('Обжаловать решение может затронутый пользователь');
    if (report.status !== 'resolved') throw new ConflictException('Обжаловать можно только рассмотренную жалобу');

    const pendingAppeal = await this.prisma.moderationAppeal.findFirst({
      where: { reportId, status: 'pending' },
      select: { id: true },
    });
    if (pendingAppeal) throw new ConflictException('Обращение уже находится на рассмотрении');

    const appeal = await this.prisma.$transaction(async (transaction) => {
      const updatedReport = await transaction.contentReport.updateMany({
        where: { id: reportId, status: 'resolved' },
        data: { status: 'appealed' },
      });
      if (updatedReport.count !== 1) throw new ConflictException('Жалоба уже рассматривается или обжалуется');
      const createdAppeal = await transaction.moderationAppeal.create({
        data: { reportId, appellantId, reason: reason.trim() },
      });
      await transaction.emailNotificationJob.create({
        data: {
          notificationType: EMAIL_NOTIFICATION_TYPE.moderationAppeal,
          sourceId: createdAppeal.id,
          status: EMAIL_NOTIFICATION_JOB_STATUS.queued,
        },
      });
      await transaction.moderationAction.create({
        data: { reportId, actorId: appellantId, action: 'appeal_submitted', note: reason.trim() },
      });
      return createdAppeal;
    });
    return { id: appeal.id, status: appeal.status, createdAt: appeal.createdAt };
  }

  async getAppealQueue(take = 50) {
    return await this.prisma.moderationAppeal.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take,
      select: { id: true, reportId: true, appellantId: true, reason: true, createdAt: true, status: true },
    });
  }

  async decideAppeal(appealId: string, moderatorId: string, request: ModerationAppealDecisionDto) {
    const appeal = await this.prisma.moderationAppeal.findUnique({ where: { id: appealId } });
    if (!appeal) throw new NotFoundException('Обращение не найдено');
    if (appeal.status !== 'pending') throw new ConflictException('Обращение уже рассмотрено');
    const report = await this.prisma.contentReport.findUnique({ where: { id: appeal.reportId } });
    if (!report) throw new NotFoundException('Жалоба не найдена');
    const reviewedAt = new Date();
    const action = request.decision === 'upheld' ? 'appeal_upheld' : 'appeal_rejected';

    await this.prisma.$transaction(async (transaction) => {
      const updatedAppeal = await transaction.moderationAppeal.updateMany({
        where: { id: appealId, status: 'pending' },
        data: {
          status: request.decision,
          reviewerId: moderatorId,
          reviewedAt,
          resolutionNote: request.note?.trim() || null,
        },
      });
      if (updatedAppeal.count !== 1) throw new ConflictException('Обращение уже рассмотрено');
      if (request.decision === 'upheld') {
        const suspensionAction = await transaction.moderationAction.findFirst({
          where: { reportId: report.id, action: { in: ['temporary_suspend', 'permanent_suspend'] } },
          select: { id: true },
        });
        if (report.targetType === 'user') {
          if (report.subjectUserId && suspensionAction) {
            await transaction.user.update({ where: { id: report.subjectUserId }, data: { bannedUntil: null } });
          }
        } else {
          await this.updateTargetModerationStatus(transaction, report, 'visible');
        }
      }
      await transaction.moderationAction.create({
        data: { reportId: report.id, actorId: moderatorId, action, note: request.note?.trim() || null },
      });
      await transaction.contentReport.update({
        where: { id: report.id },
        data: { status: 'resolved', assignedModeratorId: moderatorId, reviewedAt },
      });
    });
    return await this.prisma.moderationAppeal.findUnique({ where: { id: appealId } });
  }

  private async resolveReportTarget(
    targetType: ContentReportTargetType,
    targetId: string,
  ): Promise<ModerationTarget | null> {
    if (targetType === 'media_upload') return null;
    if (targetType === 'activity') {
      const activity = await this.prisma.activity.findUnique({
        where: { id: targetId },
        select: { id: true, userId: true, moderationStatus: true },
      });
      if (!activity || activity.moderationStatus !== 'visible') return null;
      return { targetType, targetId, subjectUserId: activity.userId, activityId: targetId };
    }
    if (targetType === 'comment') {
      const comment = await this.prisma.comment.findUnique({
        where: { id: targetId },
        select: { authorId: true, moderationStatus: true },
      });
      if (!comment || comment.moderationStatus !== 'visible') return null;
      return { targetType, targetId, subjectUserId: comment.authorId, commentId: targetId };
    }
    if (targetType === 'media') {
      const media = await this.prisma.activityMedia.findUnique({
        where: { id: targetId },
        select: { userId: true, moderationStatus: true },
      });
      if (!media || media.moderationStatus !== 'visible') return null;
      return { targetType, targetId, subjectUserId: media.userId, mediaId: targetId };
    }
    const user = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!user) return null;
    return { targetType, targetId, subjectUserId: targetId, targetUserId: targetId };
  }

  private getContentStatus(action: string) {
    if (action === 'hide_content') return 'hidden';
    if (action === 'remove_content') return 'removed';
    return 'visible';
  }

  private async updateTargetModerationStatus(
    transaction: PrismaService,
    report: Record<string, unknown>,
    status: 'visible' | 'hidden' | 'removed',
  ) {
    const targetType = report.targetType as ContentReportTargetType;
    const targetId = String(report.targetId);
    if (targetType === 'activity') {
      await transaction.activity.update({ where: { id: targetId }, data: { moderationStatus: status } });
    } else if (targetType === 'comment') {
      await transaction.comment.update({ where: { id: targetId }, data: { moderationStatus: status } });
    } else if (targetType === 'media') {
      await transaction.activityMedia.update({ where: { id: targetId }, data: { moderationStatus: status } });
    } else {
      throw new BadRequestException('Действие к профилю применить нельзя');
    }
  }
}
