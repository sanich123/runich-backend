import type { ContentReportStatus, ContentReportTargetType } from 'src/moderation/shared/moderation.types';

type ModerationReportPerson = {
  id: string;
  email: string;
  profile: {
    name: string | null;
    surname: string | null;
    bio?: string | null;
    profilePhoto: string | null;
    profilePhotoPendingAssetId: string | null;
  } | null;
};

type ModerationReportMedia = {
  url: string | null;
  thumbnail: string | null;
  userId: string;
  mediaReviewStatus: string | null;
  mediaModerationAssetId: string | null;
  thumbnailModerationAssetId: string | null;
  mediaModerationAsset?: { contentType: string | null } | null;
  thumbnailModerationAsset?: { contentType: string | null } | null;
};

type ModerationReportActivity = {
  userId: string;
  moderationStatus: string;
  textModerationStatus: string;
  title: string | null;
  description: string | null;
  sport: string;
  date: Date;
  duration: number;
  distance: number;
  locationName: string | null;
  mapPhotoUrl: string | null;
  routeOnlyMapPhotoUrl: string | null;
  media: ModerationReportMedia[];
};

export type ModerationReportEmailRecord = {
  id: string;
  reporterId: string | null;
  subjectUserId: string | null;
  status: ContentReportStatus;
  targetId: string;
  targetType: ContentReportTargetType;
  reason: string;
  details: string | null;
  reporter: ModerationReportPerson | null;
  subjectUser: ModerationReportPerson | null;
  activity: ModerationReportActivity | null;
  comment: {
    comment: string;
    authorId: string;
    moderationStatus: string;
    activity: ModerationReportActivity | null;
  } | null;
  groupPost: {
    text: string;
    createdByUserId: string;
    moderationStatus: string;
    group: { name: string } | null;
    photoAsset: { id: string; ownerId: string } | null;
  } | null;
  media:
    | (ModerationReportMedia & {
        moderationStatus: string;
        activity: ModerationReportActivity | null;
      })
    | null;
  mediaUpload: {
    id: string;
    ownerId: string;
    status: string;
    contentType: string;
    owner: ModerationReportPerson | null;
  } | null;
};

export type ModerationReportEmailGroup = {
  name: string;
  description: string | null;
  locationName: string | null;
  createdByUserId: string;
  moderationStatus: string;
  photoAsset: { id: string; ownerId: string } | null;
} | null;

type ResolvePreviewUrl = (
  ownerId: string | null | undefined,
  assetId: string | null | undefined,
) => Promise<string | null>;

export async function resolveReportedMediaUrls(
  report: ModerationReportEmailRecord,
  group: ModerationReportEmailGroup,
  resolveAssetPreview: ResolvePreviewUrl,
) {
  const reportedMediaUrls: string[] = [];
  const reportedVideoUrls: string[] = [];
  const activity = report.activity ?? report.comment?.activity ?? report.media?.activity ?? null;
  const activityMedia = activity?.media ?? [];
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
    const targetPreview = originalPreview ?? thumbnailPreview;
    if (targetPreview) {
      (isVideo(report.media?.mediaModerationAsset?.contentType, targetPreview)
        ? reportedVideoUrls
        : reportedMediaUrls
      ).push(targetPreview);
    }
  }

  if (report.targetType !== 'media') {
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
  }

  return {
    reportedMediaUrls: reportedMediaUrls.slice(0, 5),
    reportedVideoUrls: reportedVideoUrls.slice(0, 5),
  };
}

export function getReportedContent(
  report: ModerationReportEmailRecord,
  group: ModerationReportEmailGroup,
  contentAuthor: ModerationReportPerson | null,
): string | null {
  switch (report.targetType) {
    case 'activity':
    case 'activity_text':
      return report.activity?.description ?? null;
    case 'comment':
      return report.comment?.comment ?? null;
    case 'group_post':
      return report.groupPost?.text ?? null;
    case 'user':
      return contentAuthor?.profile?.bio ?? null;
    case 'group':
      return group?.description ?? null;
    case 'media':
    case 'media_upload':
      return null;
  }
}

export function getReportedModerationStatus(
  report: ModerationReportEmailRecord,
  group: ModerationReportEmailGroup,
): string | null {
  switch (report.targetType) {
    case 'media_upload':
      return report.mediaUpload?.status ?? null;
    case 'activity':
      return report.activity?.moderationStatus ?? null;
    case 'activity_text':
      return report.activity?.textModerationStatus ?? null;
    case 'comment':
      return report.comment?.moderationStatus ?? null;
    case 'group_post':
      return report.groupPost?.moderationStatus ?? null;
    case 'media':
      return report.media?.moderationStatus ?? null;
    case 'group':
      return group?.moderationStatus ?? null;
    case 'user':
      return null;
  }
}
