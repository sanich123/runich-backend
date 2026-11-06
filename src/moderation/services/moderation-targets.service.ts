import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { ContentReportTargetType, ModerationTarget } from '../shared/moderation.types';

@Injectable()
export class ModerationTargetsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async resolveReportTarget(targetType: ContentReportTargetType, targetId: string): Promise<ModerationTarget | null> {
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
    if (targetType === 'group') {
      const group = await this.prisma.group.findUnique({
        where: { id: targetId },
        select: { id: true, createdByUserId: true, moderationStatus: true },
      });
      if (!group || group.moderationStatus !== 'visible') return null;
      return { targetType, targetId, subjectUserId: group.createdByUserId };
    }
    const user = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!user) return null;
    return { targetType, targetId, subjectUserId: targetId, targetUserId: targetId };
  }

  getContentStatus(action: string) {
    if (action === 'hide_content') return 'hidden';
    if (action === 'remove_content') return 'removed';
    return 'visible';
  }

  async updateTargetModerationStatus(
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
    } else if (targetType === 'group') {
      await transaction.group.update({ where: { id: targetId }, data: { moderationStatus: status } });
    } else {
      throw new BadRequestException('Действие к профилю применить нельзя');
    }
  }
}
