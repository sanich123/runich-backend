import { jest } from '@jest/globals';
import {
  resolveModerationAppealNotification,
  resolveModerationReportNotification,
  resolveReporterDecisionNotification,
  resolveReporterReceiptNotification,
} from '../email-notification-moderation.handlers';

describe('resolveModerationReportNotification', () => {
  const asyncUnknownMock = () => jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const prisma = {
    contentReport: { findUnique: asyncUnknownMock() },
    group: { findUnique: asyncUnknownMock() },
    moderationAction: { findUnique: asyncUnknownMock() },
    moderationAppeal: { findUnique: asyncUnknownMock() },
    user: { findUnique: asyncUnknownMock() },
  };
  const notifications = {
    sendModerationUpdate: jest.fn<(...args: unknown[]) => Promise<void>>(),
    sendReporterModerationUpdate: jest.fn<(...args: unknown[]) => Promise<void>>(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.group.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);
    notifications.sendModerationUpdate.mockResolvedValue(undefined);
    notifications.sendReporterModerationUpdate.mockResolvedValue(undefined);
  });

  async function resolve(report: Record<string, unknown> | null, storage?: Record<string, unknown>) {
    prisma.contentReport.findUnique.mockResolvedValue(report);
    const notification = await resolveModerationReportNotification(
      prisma as never,
      notifications as never,
      'report-1',
      storage as never,
    );
    if (notification) await notification.send();
    return notifications.sendModerationUpdate.mock.calls.at(-1)?.[0];
  }

  function makeReport(overrides: Record<string, unknown> = {}) {
    return {
      id: 'report-1',
      targetId: 'target-1',
      targetType: 'comment',
      reason: 'spam',
      details: null,
      reporter: null,
      subjectUser: null,
      activity: null,
      comment: null,
      groupPost: null,
      media: null,
      mediaUpload: null,
      ...overrides,
    };
  }

  const activity = (overrides: Record<string, unknown> = {}) => ({
    title: 'Evening run',
    description: 'Easy pace',
    sport: 'run',
    date: new Date('2026-11-14T16:00:00.000Z'),
    duration: 3_600_000,
    distance: 5_000,
    locationName: 'Moscow',
    mapPhotoUrl: null,
    routeOnlyMapPhotoUrl: 'https://cdn.example/route.jpg',
    media: [],
    ...overrides,
  });

  it('skips a report that was deleted before its email job ran', async () => {
    await expect(resolve(null)).resolves.toBeUndefined();
    expect(notifications.sendModerationUpdate).not.toHaveBeenCalled();
  });

  it('includes a human comment report, both user profiles, and ordered activity media', async () => {
    const preview = jest.fn(async (_ownerId: string, assetId: string | null | undefined) => {
      if (assetId === 'reporter-avatar') return 'https://cdn.example/reporter-avatar.jpg';
      if (assetId === 'comment-photo') return 'https://cdn.example/comment-photo.jpg';
      return null;
    });
    const payload = await resolve(
      makeReport({
        targetType: 'comment',
        reason: 'harassment',
        details: 'Repeated messages',
        reporter: {
          id: 'reporter-1',
          email: 'reporter@example.com',
          profile: {
            name: 'Sam',
            surname: 'Reporter',
            profilePhoto: null,
            profilePhotoPendingAssetId: 'reporter-avatar',
          },
        },
        subjectUser: {
          id: 'author-1',
          email: 'author@example.com',
          profile: {
            name: 'Alex',
            surname: 'Runner',
            bio: null,
            profilePhoto: 'https://cdn.example/author-avatar.jpg',
            profilePhotoPendingAssetId: null,
          },
        },
        comment: {
          comment: 'The reported comment',
          activity: activity({
            media: [
              {
                url: 'https://cdn.example/comment-photo.jpg',
                thumbnail: null,
                userId: 'author-1',
                mediaReviewStatus: 'approved',
                mediaModerationAssetId: 'comment-photo',
                thumbnailModerationAssetId: null,
                mediaModerationAsset: { contentType: 'image/webp' },
                thumbnailModerationAsset: null,
              },
              {
                url: 'https://cdn.example/run-video.mp4',
                thumbnail: null,
                userId: 'author-1',
                mediaReviewStatus: 'approved',
                mediaModerationAssetId: null,
                thumbnailModerationAssetId: null,
                mediaModerationAsset: { contentType: 'video/mp4' },
                thumbnailModerationAsset: null,
              },
              {
                url: 'https://cdn.example/rejected.jpg',
                thumbnail: null,
                userId: 'author-1',
                mediaReviewStatus: 'rejected',
                mediaModerationAssetId: null,
                thumbnailModerationAssetId: null,
                mediaModerationAsset: null,
                thumbnailModerationAsset: null,
              },
            ],
          }),
        },
      }),
      { getOwnerModerationPreviewUrl: preview },
    );

    expect(payload).toMatchObject({
      targetType: 'comment',
      reporter: {
        email: 'reporter@example.com',
        name: 'Sam',
        surname: 'Reporter',
        profilePhoto: 'https://cdn.example/reporter-avatar.jpg',
      },
      reportedUser: {
        email: 'author@example.com',
        name: 'Alex',
        surname: 'Runner',
        profilePhoto: 'https://cdn.example/author-avatar.jpg',
      },
      reportedContent: 'The reported comment',
      reportedMediaUrls: ['https://cdn.example/comment-photo.jpg'],
      reportedVideoUrls: ['https://cdn.example/run-video.mp4'],
      reportedGroup: null,
    });
    expect(payload).toMatchObject({
      reportedActivity: {
        title: 'Evening run',
        sport: 'run',
        distance: 5_000,
        duration: 3_600_000,
        locationName: 'Moscow',
        mapPhotoUrl: 'https://cdn.example/route.jpg',
      },
    });
    expect(preview).toHaveBeenCalledWith('reporter-1', 'reporter-avatar');
    expect(preview).toHaveBeenCalledWith('author-1', 'comment-photo');
    expect(JSON.stringify(payload)).not.toContain('rejected.jpg');
  });

  it('adds only status-appropriate direct moderation action links to an open report email', async () => {
    const originalJwtSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'test-moderation-email-action-secret';
    try {
      const payload = await resolve(
        makeReport({
          status: 'open',
          targetType: 'comment',
          reporter: { id: 'reporter-1', email: 'reporter@example.com', profile: null },
          subjectUser: { id: 'author-1', email: 'author@example.com', profile: null },
          comment: { comment: 'Reported text', moderationStatus: 'visible' },
        }),
      );

      expect(payload).toMatchObject({
        moderationActions: expect.arrayContaining([
          expect.objectContaining({ label: 'Скрыть контент' }),
          expect.objectContaining({ label: 'Удалить контент' }),
          expect.objectContaining({ label: 'Предупредить автора' }),
        ]),
      });
      const actionLinks = (payload as { moderationActions: Array<{ href: string }> }).moderationActions;
      expect(actionLinks).toHaveLength(6);
      expect(actionLinks.every(({ href }) => href.startsWith('http://localhost:3000/moderation/email-actions/'))).toBe(
        true,
      );
    } finally {
      if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = originalJwtSecret;
    }
  });

  it('uses automatic-text context for activity text and keeps its content without a reporter', async () => {
    const payload = await resolve(
      makeReport({
        targetType: 'activity_text',
        details: 'ONNX flagged the activity text',
        subjectUser: null,
        activity: activity({ mapPhotoUrl: 'https://cdn.example/map.jpg', routeOnlyMapPhotoUrl: null, media: [] }),
      }),
    );

    expect(payload).toMatchObject({
      targetType: 'activity_text',
      reporter: null,
      reportedUser: null,
      reportedContent: 'Easy pace',
      reportedMediaUrls: [],
      reportedVideoUrls: [],
      reportedActivity: { mapPhotoUrl: 'https://cdn.example/map.jpg' },
    });
  });

  it('includes group post text, its photo, and the group name', async () => {
    const payload = await resolve(
      makeReport({
        targetType: 'group_post',
        groupPost: {
          text: 'Group post text',
          group: { name: 'Morning runners' },
          photoAsset: { id: 'post-photo', ownerId: 'post-author' },
        },
      }),
      { getOwnerModerationPreviewUrl: jest.fn(async () => 'https://cdn.example/post.jpg') },
    );

    expect(payload).toMatchObject({
      reportedContent: 'Group post text',
      reportedMediaUrls: ['https://cdn.example/post.jpg'],
      reportedGroup: { name: 'Morning runners', locationName: null },
    });
  });

  it('loads group details and its photo for a group report', async () => {
    prisma.group.findUnique.mockResolvedValue({
      name: 'Morning runners',
      description: 'Group description',
      locationName: 'Moscow',
      photoAsset: { id: 'group-photo', ownerId: 'group-owner' },
    });
    const payload = await resolve(makeReport({ targetType: 'group', subjectUser: null }), {
      getOwnerModerationPreviewUrl: jest.fn(async () => 'https://cdn.example/group.jpg'),
    });

    expect(payload).toMatchObject({
      reportedContent: 'Group description',
      reportedMediaUrls: ['https://cdn.example/group.jpg'],
      reportedGroup: { name: 'Morning runners', locationName: 'Moscow' },
      reportedUser: null,
    });
  });

  it('includes quarantined media-upload previews and labels video links separately', async () => {
    const payload = await resolve(
      makeReport({
        targetType: 'media_upload',
        mediaUpload: {
          id: 'upload-1',
          ownerId: 'uploader-1',
          status: 'review_required',
          contentType: 'video/mp4',
          owner: null,
        },
      }),
      { getOwnerModerationPreviewUrl: jest.fn(async () => 'https://cdn.example/upload.mp4') },
    );

    expect(payload).toMatchObject({
      reportedMediaUrls: [],
      reportedVideoUrls: ['https://cdn.example/upload.mp4'],
    });
  });

  it('includes user profile details directly in a user report', async () => {
    const payload = await resolve(
      makeReport({
        targetType: 'user',
        subjectUser: {
          id: 'reported-user',
          email: 'reported@example.com',
          profile: {
            name: 'Taylor',
            surname: 'Runner',
            bio: 'Reported profile text',
            profilePhoto: null,
            profilePhotoPendingAssetId: null,
          },
        },
      }),
    );

    expect(payload).toMatchObject({
      reportedContent: 'Reported profile text',
      reportedProfile: { bio: 'Reported profile text' },
      reportedUser: { email: 'reported@example.com', name: 'Taylor', surname: 'Runner', profilePhoto: null },
    });
  });

  it('handles missing report text and profile bio without rendering undefined', async () => {
    const comment = await resolve(makeReport({ targetType: 'comment', comment: { comment: null, activity: null } }));
    expect(comment).toMatchObject({ reportedContent: null });

    const post = await resolve(
      makeReport({ targetType: 'group_post', groupPost: { text: null, group: null, photoAsset: null } }),
    );
    expect(post).toMatchObject({ reportedContent: null, reportedGroup: null });

    const user = await resolve(
      makeReport({
        targetType: 'user',
        subjectUser: {
          id: 'reported-user',
          email: 'reported@example.com',
          profile: {
            name: null,
            surname: null,
            bio: null,
            profilePhoto: null,
            profilePhotoPendingAssetId: null,
          },
        },
      }),
    );
    expect(user).toMatchObject({
      reportedContent: null,
      reportedProfile: { bio: null },
      reportedUser: { email: 'reported@example.com', name: null, surname: null, profilePhoto: null },
    });
  });

  it('uses URL video detection and deduplicates repeated activity media', async () => {
    const duplicateVideo = {
      url: 'https://cdn.example/run.webm',
      thumbnail: null,
      userId: 'author-1',
      mediaReviewStatus: 'approved',
      mediaModerationAssetId: null,
      thumbnailModerationAssetId: null,
      mediaModerationAsset: null,
      thumbnailModerationAsset: null,
    };
    const payload = await resolve(
      makeReport({
        targetType: 'activity',
        activity: activity({ description: null, media: [duplicateVideo, duplicateVideo] }),
      }),
    );

    expect(payload).toMatchObject({
      reportedContent: null,
      reportedVideoUrls: ['https://cdn.example/run.webm'],
      reportedMediaUrls: [],
      reportedActivity: { title: 'Evening run' },
    });
  });

  it('prefers the reported media original and categorizes an image upload preview', async () => {
    const thumbnail = await resolve(
      makeReport({
        targetType: 'media',
        media: {
          url: 'https://cdn.example/original.jpg',
          thumbnail: 'https://cdn.example/thumbnail.jpg',
          userId: 'author-1',
          mediaReviewStatus: 'approved',
          mediaModerationAssetId: null,
          thumbnailModerationAssetId: null,
          mediaModerationAsset: { contentType: 'image/jpeg' },
          thumbnailModerationAsset: null,
          activity: null,
        },
      }),
    );
    expect(thumbnail).toMatchObject({
      reportedMediaUrls: ['https://cdn.example/original.jpg'],
      reportedVideoUrls: [],
    });

    const upload = await resolve(
      makeReport({
        targetType: 'media_upload',
        mediaUpload: {
          id: 'upload-2',
          ownerId: 'uploader-1',
          status: 'review_required',
          contentType: 'image/jpeg',
          owner: null,
        },
      }),
      { getOwnerModerationPreviewUrl: jest.fn(async () => 'https://cdn.example/upload.jpg') },
    );
    expect(upload).toMatchObject({
      reportedMediaUrls: ['https://cdn.example/upload.jpg'],
      reportedVideoUrls: [],
    });
  });

  it('omits unavailable group and group-post photos', async () => {
    const post = await resolve(
      makeReport({
        targetType: 'group_post',
        groupPost: {
          text: 'Text only post',
          group: { name: 'Morning runners' },
          photoAsset: { id: 'missing-post-photo', ownerId: 'post-author' },
        },
      }),
      { getOwnerModerationPreviewUrl: jest.fn(async () => null) },
    );
    expect(post).toMatchObject({ reportedContent: 'Text only post', reportedMediaUrls: [] });

    const group = await resolve(makeReport({ targetType: 'group' }));
    expect(group).toMatchObject({ reportedContent: null, reportedGroup: null, reportedMediaUrls: [] });
  });

  it('does not show rejected media previews and falls back to a direct video URL', async () => {
    const rejected = await resolve(
      makeReport({
        targetType: 'media',
        media: { mediaReviewStatus: 'rejected', url: 'https://cdn.example/rejected.mp4', activity: null },
      }),
      { getOwnerModerationPreviewUrl: jest.fn() },
    );
    expect(rejected).toMatchObject({ reportedMediaUrls: [], reportedVideoUrls: [] });

    const video = await resolve(
      makeReport({
        targetType: 'media',
        media: {
          url: 'https://cdn.example/reported.mp4',
          thumbnail: null,
          userId: 'author-1',
          mediaReviewStatus: 'approved',
          mediaModerationAssetId: null,
          thumbnailModerationAssetId: null,
          mediaModerationAsset: { contentType: 'video/mp4' },
          thumbnailModerationAsset: null,
          activity: null,
        },
      }),
    );
    expect(video).toMatchObject({ reportedMediaUrls: [], reportedVideoUrls: ['https://cdn.example/reported.mp4'] });
  });

  it('sends reporter receipts in the reporter language and skips reports without a reporter', async () => {
    prisma.contentReport.findUnique.mockResolvedValue(null);
    await expect(
      resolveReporterReceiptNotification(prisma as never, notifications as never, 'report-1'),
    ).resolves.toBeNull();

    prisma.contentReport.findUnique.mockResolvedValue({
      id: 'report-1',
      targetType: 'user',
      reason: 'spam',
      reporter: null,
    });
    await expect(
      resolveReporterReceiptNotification(prisma as never, notifications as never, 'report-1'),
    ).resolves.toBeNull();

    prisma.contentReport.findUnique.mockResolvedValue({
      id: 'report-1',
      targetType: 'user',
      reason: 'spam',
      reporter: { profile: { language: 'russian' } },
    });
    const notification = await resolveReporterReceiptNotification(prisma as never, notifications as never, 'report-1');
    await notification?.send();
    expect(notifications.sendReporterModerationUpdate).toHaveBeenCalledWith({
      reportId: 'report-1',
      targetType: 'user',
      reason: 'spam',
      requestType: 'received',
      locale: 'russian',
    });
  });

  it('sends reporter decisions for each outcome and skips incomplete actions', async () => {
    prisma.moderationAction.findUnique.mockResolvedValue(null);
    await expect(
      resolveReporterDecisionNotification(prisma as never, notifications as never, 'action-1'),
    ).resolves.toBeNull();

    prisma.moderationAction.findUnique.mockResolvedValue({ report: null });
    await expect(
      resolveReporterDecisionNotification(prisma as never, notifications as never, 'action-1'),
    ).resolves.toBeNull();

    prisma.moderationAction.findUnique.mockResolvedValue({ action: 'reject_report', report: { reporter: null } });
    await expect(
      resolveReporterDecisionNotification(prisma as never, notifications as never, 'action-1'),
    ).resolves.toBeNull();

    const sendDecision = async (action: string) => {
      prisma.moderationAction.findUnique.mockResolvedValue({
        action,
        report: {
          id: 'report-1',
          targetType: 'comment',
          reason: 'spam',
          reporter: { profile: { language: 'english' } },
        },
      });
      const notification = await resolveReporterDecisionNotification(
        prisma as never,
        notifications as never,
        'action-1',
      );
      await notification?.send();
      return notifications.sendReporterModerationUpdate.mock.calls.at(-1)?.[0];
    };

    expect(await sendDecision('reject_report')).toMatchObject({ requestType: 'decision', outcome: 'not-confirmed' });
    expect(await sendDecision('restore_content')).toMatchObject({
      requestType: 'decision',
      outcome: 'content-restored',
    });
    expect(await sendDecision('confirm_report')).toMatchObject({ requestType: 'decision', outcome: 'confirmed' });

    prisma.moderationAction.findUnique.mockResolvedValue({
      action: 'confirm_report',
      report: {
        id: 'report-2',
        targetType: 'activity',
        reason: 'other',
        reporter: { profile: { language: 'russian' } },
      },
    });
    const russian = await resolveReporterDecisionNotification(prisma as never, notifications as never, 'action-2');
    await russian?.send();
    expect(notifications.sendReporterModerationUpdate.mock.calls.at(-1)?.[0]).toMatchObject({
      reportId: 'report-2',
      locale: 'russian',
    });
  });

  it('sends an appeal notification and skips an appeal whose report was removed', async () => {
    prisma.moderationAppeal.findUnique.mockResolvedValue(null);
    await expect(
      resolveModerationAppealNotification(prisma as never, notifications as never, 'appeal-1'),
    ).resolves.toBeNull();

    prisma.moderationAppeal.findUnique.mockResolvedValue({ report: { id: 'report-1', targetType: 'activity' } });
    const notification = await resolveModerationAppealNotification(prisma as never, notifications as never, 'appeal-1');
    await notification?.send();
    expect(notifications.sendModerationUpdate).toHaveBeenCalledWith({
      reportId: 'report-1',
      appealId: 'appeal-1',
      requestType: 'appeal',
      targetType: 'activity',
      reason: 'appeal',
    });
  });
});
