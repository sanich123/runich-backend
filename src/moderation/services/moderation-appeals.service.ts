import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ModerationTargetsService } from './moderation-targets.service';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EMAIL_NOTIFICATION_JOB_STATUS, EMAIL_NOTIFICATION_TYPE } from 'src/email/email-notification.constants';
import { ModerationAppealDecisionDto } from '../dto/moderation.dto';

@Injectable()
export class ModerationAppealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly targets: ModerationTargetsService,
  ) {}

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
          await this.targets.updateTargetModerationStatus(transaction, report, 'visible');
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
}
