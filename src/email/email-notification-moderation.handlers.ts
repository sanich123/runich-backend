import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { StorageService } from 'src/storage/services/storage.service';
import { EmailNotificationService } from './email-notification.service';
import {
  getAvailableModerationEmailActions,
  getModerationEmailActionLabel,
} from 'src/moderation/moderation-email-actions.policy';
import { getModerationEmailActionUrl } from 'src/moderation/moderation-email-action-token.utils';

export async function resolveModerationReportNotification(
  prisma: PrismaService,
  notifications: EmailNotificationService,
  sourceId: string,
  storage?: StorageService,
) {
  const activitySelect = {
    userId: true,
    moderationStatus: true,
    textModerationStatus: true,
    title: true,
    description: true,
    sport: true,
    date: true,
    duration: true,
    distance: true,
    locationName: true,
    mapPhotoUrl: true,
    routeOnlyMapPhotoUrl: true,
    media: {
      orderBy: { position: 'asc' as const },
      take: 4,
      select: {
        url: true,
        thumbnail: true,
        userId: true,
        mediaReviewStatus: true,
        mediaModerationAssetId: true,
        thumbnailModerationAssetId: true,
        mediaModerationAsset: { select: { contentType: true } },
        thumbnailModerationAsset: { select: { contentType: true } },
      },
    },
  };
  const report = await prisma.contentReport.findUnique({
    where: { id: sourceId },
    select: {
      id: true,
      reporterId: true,
      subjectUserId: true,
      status: true,
      targetId: true,
      targetType: true,
      reason: true,
      details: true,
      reporter: {
        select: {
          id: true,
          email: true,
          profile: {
            select: {
              name: true,
              surname: true,
              profilePhoto: true,
              profilePhotoPendingAssetId: true,
            },
          },
        },
      },
      subjectUser: {
        select: {
          id: true,
          email: true,
          profile: {
            select: {
              name: true,
              surname: true,
              bio: true,
              profilePhoto: true,
              profilePhotoPendingAssetId: true,
            },
          },
        },
      },
      activity: { select: activitySelect },
      comment: {
        select: { comment: true, authorId: true, moderationStatus: true, activity: { select: activitySelect } },
      },
      groupPost: {
        select: {
          text: true,
          createdByUserId: true,
          moderationStatus: true,
          group: { select: { name: true } },
          photoAsset: { select: { id: true, ownerId: true } },
        },
      },
      media: {
        select: {
          url: true,
          thumbnail: true,
          userId: true,
          moderationStatus: true,
          mediaReviewStatus: true,
          mediaModerationAssetId: true,
          thumbnailModerationAssetId: true,
          mediaModerationAsset: { select: { contentType: true } },
          thumbnailModerationAsset: { select: { contentType: true } },
          activity: { select: activitySelect },
        },
      },
      mediaUpload: {
        select: {
          id: true,
          ownerId: true,
          status: true,
          contentType: true,
          owner: {
            select: {
              id: true,
              email: true,
              profile: {
                select: {
                  name: true,
                  surname: true,
                  bio: true,
                  profilePhoto: true,
                  profilePhotoPendingAssetId: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!report) return null;
  const group =
    report.targetType === 'group'
      ? await prisma.group.findUnique({
          where: { id: report.targetId },
          select: {
            name: true,
            description: true,
            locationName: true,
            createdByUserId: true,
            moderationStatus: true,
            photoAsset: { select: { id: true, ownerId: true } },
          },
        })
      : null;
  const resolveAssetPreview = async (ownerId: string | null | undefined, assetId: string | null | undefined) => {
    if (!storage || !ownerId || !assetId) return null;
    try {
      return await storage.getOwnerModerationPreviewUrl(ownerId, assetId);
    } catch {
      return null;
    }
  };
  const mapPerson = async (
    user:
      | {
          id: string;
          email: string;
          profile: {
            name: string | null;
            surname: string | null;
            profilePhoto: string | null;
            profilePhotoPendingAssetId: string | null;
            bio?: string | null;
          } | null;
        }
      | null
      | undefined,
  ) => {
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.profile?.name,
      surname: user.profile?.surname,
      profilePhoto:
        (await resolveAssetPreview(user.id, user.profile?.profilePhotoPendingAssetId)) ??
        user.profile?.profilePhoto ??
        null,
    };
  };
  const activity = report.activity ?? report.comment?.activity ?? report.media?.activity ?? null;
  const authorId =
    report.subjectUserId ??
    report.activity?.userId ??
    report.comment?.authorId ??
    report.groupPost?.createdByUserId ??
    report.media?.userId ??
    report.mediaUpload?.ownerId ??
    group?.createdByUserId ??
    (report.targetType === 'user' ? report.targetId : null);
  const [fallbackReporter, fallbackAuthor] = await Promise.all([
    !report.reporter && report.reporterId
      ? prisma.user.findUnique({
          where: { id: report.reporterId },
          select: {
            id: true,
            email: true,
            profile: {
              select: {
                name: true,
                surname: true,
                bio: true,
                profilePhoto: true,
                profilePhotoPendingAssetId: true,
              },
            },
          },
        })
      : null,
    !report.subjectUser && !report.mediaUpload?.owner && authorId
      ? prisma.user.findUnique({
          where: { id: authorId },
          select: {
            id: true,
            email: true,
            profile: {
              select: {
                name: true,
                surname: true,
                bio: true,
                profilePhoto: true,
                profilePhotoPendingAssetId: true,
              },
            },
          },
        })
      : null,
  ]);
  const activityMedia = activity?.media ?? [];
  const reportedMediaUrls: string[] = [];
  const reportedVideoUrls: string[] = [];
  const isVideo = (contentType: string | null | undefined, url?: string | null) =>
    contentType?.startsWith('video/') === true || /\.(mp4|mov|webm)(?:$|[?#])/i.test(url ?? '');
  if (report.targetType === 'media_upload' && report.mediaUpload?.status !== 'rejected') {
    const preview = await resolveAssetPreview(report.mediaUpload?.ownerId, report.mediaUpload?.id);
    if (preview) {
      (isVideo(report.mediaUpload?.contentType, preview) ? reportedVideoUrls : reportedMediaUrls).push(preview);
    }
  } else if (report.targetType === 'group_post') {
    const preview = await resolveAssetPreview(report.groupPost?.photoAsset?.ownerId, report.groupPost?.photoAsset?.id);
    if (preview) reportedMediaUrls.push(preview);
  } else if (report.targetType === 'group') {
    const preview = await resolveAssetPreview(group?.photoAsset?.ownerId, group?.photoAsset?.id);
    if (preview) reportedMediaUrls.push(preview);
  } else if (report.targetType === 'media' && report.media?.mediaReviewStatus !== 'rejected') {
    const thumbnail = await resolveAssetPreview(report.media?.userId, report.media?.thumbnailModerationAssetId);
    const original = await resolveAssetPreview(report.media?.userId, report.media?.mediaModerationAssetId);
    const thumbnailPreview = thumbnail ?? report.media?.thumbnail;
    const originalPreview = original ?? report.media?.url;
    if (thumbnailPreview) reportedMediaUrls.push(thumbnailPreview);
    else if (originalPreview) {
      (isVideo(report.media?.mediaModerationAsset?.contentType, originalPreview)
        ? reportedVideoUrls
        : reportedMediaUrls
      ).push(originalPreview);
    }
  }
  for (const media of activityMedia) {
    if (media.mediaReviewStatus === 'rejected') continue;
    const thumbnail = await resolveAssetPreview(media.userId, media.thumbnailModerationAssetId);
    const original = await resolveAssetPreview(media.userId, media.mediaModerationAssetId);
    const thumbnailPreview = thumbnail ?? media.thumbnail;
    const originalPreview = original ?? media.url;
    if (thumbnailPreview && !reportedMediaUrls.includes(thumbnailPreview)) reportedMediaUrls.push(thumbnailPreview);
    else if (originalPreview) {
      const destination = isVideo(media.mediaModerationAsset?.contentType, originalPreview)
        ? reportedVideoUrls
        : reportedMediaUrls;
      if (!destination.includes(originalPreview)) destination.push(originalPreview);
    }
  }
  const contentAuthor = report.subjectUser ?? report.mediaUpload?.owner ?? fallbackAuthor;
  const reportedContent =
    report.targetType === 'activity' || report.targetType === 'activity_text'
      ? (report.activity?.description ?? null)
      : report.targetType === 'comment'
        ? (report.comment?.comment ?? null)
        : report.targetType === 'group_post'
          ? (report.groupPost?.text ?? null)
          : report.targetType === 'user'
            ? (contentAuthor?.profile?.bio ?? null)
            : report.targetType === 'group'
              ? (group?.description ?? null)
              : null;
  const reporterUser = report.reporter ?? fallbackReporter;
  const reporter = reporterUser ? await mapPerson(reporterUser) : null;
  const reportedUser = await mapPerson(contentAuthor);
  const moderationStatus =
    report.targetType === 'media_upload'
      ? report.mediaUpload?.status
      : report.targetType === 'activity'
        ? report.activity?.moderationStatus
        : report.targetType === 'activity_text'
          ? report.activity?.textModerationStatus
          : report.targetType === 'comment'
            ? report.comment?.moderationStatus
            : report.targetType === 'group_post'
              ? report.groupPost?.moderationStatus
              : report.targetType === 'media'
                ? report.media?.moderationStatus
                : report.targetType === 'group'
                  ? group?.moderationStatus
                  : null;
  const moderationActions = getAvailableModerationEmailActions(report.targetType, report.status, moderationStatus).map(
    (action) => ({
      label: getModerationEmailActionLabel(action),
      href: getModerationEmailActionUrl(report.id, action),
    }),
  );
  const payload = {
    reportId: report.id,
    requestType: 'report' as const,
    targetType: report.targetType,
    reason: report.reason,
    reporterDetails: report.details,
    reporter,
    reportedUser,
    reportedContent,
    reportedMediaUrls: reportedMediaUrls.slice(0, 5),
    reportedVideoUrls: reportedVideoUrls.slice(0, 5),
    reportedActivity: activity
      ? {
          title: activity.title,
          sport: activity.sport,
          date: activity.date.toISOString(),
          distance: activity.distance,
          duration: activity.duration,
          locationName: activity.locationName,
          mapPhotoUrl: activity.mapPhotoUrl ?? activity.routeOnlyMapPhotoUrl,
        }
      : null,
    reportedGroup: group
      ? { name: group.name, locationName: group.locationName }
      : report.groupPost?.group
        ? { name: report.groupPost.group.name, locationName: null }
        : null,
    reportedProfile:
      report.targetType === 'user'
        ? {
            name: contentAuthor?.profile?.name ?? null,
            surname: contentAuthor?.profile?.surname ?? null,
            bio: contentAuthor?.profile?.bio ?? null,
            profilePhoto: reportedUser?.profilePhoto ?? null,
          }
        : null,
    moderationActions,
  };
  return { send: () => notifications.sendModerationUpdate(payload) };
}

export async function resolveReporterReceiptNotification(
  prisma: PrismaService,
  notifications: EmailNotificationService,
  sourceId: string,
) {
  const report = await prisma.contentReport.findUnique({
    where: { id: sourceId },
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
  return { send: () => notifications.sendReporterModerationUpdate(payload) };
}

export async function resolveReporterDecisionNotification(
  prisma: PrismaService,
  notifications: EmailNotificationService,
  sourceId: string,
) {
  const action = await prisma.moderationAction.findUnique({
    where: { id: sourceId },
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
  return { send: () => notifications.sendReporterModerationUpdate(payload) };
}

export async function resolveModerationAppealNotification(
  prisma: PrismaService,
  notifications: EmailNotificationService,
  sourceId: string,
) {
  const appeal = await prisma.moderationAppeal.findUnique({
    where: { id: sourceId },
    select: { report: { select: { id: true, targetType: true } } },
  });
  if (!appeal) return null;
  const payload = {
    reportId: appeal.report.id,
    appealId: sourceId,
    requestType: 'appeal' as const,
    targetType: appeal.report.targetType,
    reason: 'appeal',
  };
  return { send: () => notifications.sendModerationUpdate(payload) };
}
