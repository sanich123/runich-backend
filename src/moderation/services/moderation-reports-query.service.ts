import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { StorageService } from 'src/storage/services/storage.service';
import { ACTIVE_QUEUE_STATUSES } from '../shared/moderation.constants';
import type { ContentReportStatus } from '../shared/moderation.types';
import type { ReportQueueRow } from './moderation-reports.types';

@Injectable()
export class ModerationReportsQueryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async getReportQueue(status?: ContentReportStatus, take = 50) {
    const reports = await this.prisma.contentReport.findMany({
      where: { status: status ?? { in: ACTIVE_QUEUE_STATUSES } },
      orderBy: { createdAt: 'desc' },
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
}
