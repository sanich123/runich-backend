import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { getAvailableModerationEmailActions } from '../moderation-email-actions.policy';
import type { ModerationEmailAction } from '../moderation-email-actions.types';

@Injectable()
export class ModerationEmailActionValidationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
}
