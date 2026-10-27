import { Logger } from '@nestjs/common';
import { jest } from '@jest/globals';
import { EmailNotificationWorkerService } from '../email-notification-worker.service';
import { asyncMock } from 'src/tests/helpers';
import { makeProfileSummary } from 'src/tests/fixtures/profile.fixtures';

describe('EmailNotificationWorkerService', () => {
  const prisma = {
    emailNotificationJob: { findFirst: asyncMock(), updateMany: asyncMock(), update: asyncMock() },
    like: { findUnique: asyncMock() },
    comment: { findUnique: asyncMock() },
    commentLike: { findUnique: asyncMock() },
    contentReport: { findUnique: asyncMock() },
    profile: { findUnique: asyncMock() },
    moderationAction: { findUnique: asyncMock() },
    moderationAppeal: { findUnique: asyncMock() },
  };
  const notifications = {
    sendLike: asyncMock(),
    sendComment: asyncMock(),
    sendCommentLike: asyncMock(),
    sendModerationUpdate: asyncMock(),
    sendReporterModerationUpdate: asyncMock(),
  };
  const worker = new EmailNotificationWorkerService(prisma as never, notifications as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.emailNotificationJob.findFirst.mockResolvedValue({
      id: 'job-1',
      notificationType: 'activity-like',
      sourceId: 'source-1',
      attempts: 0,
    });
    prisma.emailNotificationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.emailNotificationJob.update.mockResolvedValue({});
    notifications.sendLike.mockResolvedValue(undefined);
    notifications.sendComment.mockResolvedValue(undefined);
    notifications.sendCommentLike.mockResolvedValue(undefined);
    notifications.sendModerationUpdate.mockResolvedValue(undefined);
    notifications.sendReporterModerationUpdate.mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('sends an activity-like email using the persisted actor and activity owner data', async () => {
    prisma.like.findUnique.mockResolvedValue({
      authorId: 'liker-1',
      profile: makeProfileSummary({ profilePhoto: 'alice.jpg' }),
      activity: {
        id: 'activity-1',
        userId: 'owner-1',
        mapPhotoUrl: 'activity-map.jpg',
        profile: {
          userId: 'owner-1',
          name: 'Bob',
          surname: 'Owner',
          emailNotifications: true,
          user: { email: 'owner@example.com' },
        },
      },
    });

    await expect(worker.processNextJob()).resolves.toBe(true);

    expect(notifications.sendLike).toHaveBeenCalledWith({
      activityId: 'activity-1',
      actorName: 'Alice',
      actorSurname: 'Runner',
      actorProfilePhoto: 'alice.jpg',
      recipientEmail: 'owner@example.com',
      recipientName: 'Bob',
      recipientSurname: 'Owner',
      mapPhotoUrl: 'activity-map.jpg',
    });
    expect(prisma.emailNotificationJob.update).toHaveBeenLastCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({ status: 'sent', startedAt: null, finishedAt: expect.any(Date) }),
    });
  });

  it('returns without claiming when the queue is empty', async () => {
    prisma.emailNotificationJob.findFirst.mockResolvedValue(null);

    await expect(worker.processNextJob()).resolves.toBe(false);

    expect(prisma.emailNotificationJob.updateMany).not.toHaveBeenCalled();
  });

  it('does not process a job claimed by another worker', async () => {
    prisma.emailNotificationJob.updateMany.mockResolvedValue({ count: 0 });

    await expect(worker.processNextJob()).resolves.toBe(true);

    expect(prisma.like.findUnique).not.toHaveBeenCalled();
    expect(prisma.emailNotificationJob.update).not.toHaveBeenCalled();
  });

  it('marks jobs with unknown notification types as skipped', async () => {
    prisma.emailNotificationJob.findFirst.mockResolvedValue({
      id: 'job-unknown',
      notificationType: 'unknown',
      sourceId: 'source-1',
      attempts: 0,
    });

    await worker.processNextJob();

    expect(prisma.emailNotificationJob.update).toHaveBeenLastCalledWith({
      where: { id: 'job-unknown' },
      data: expect.objectContaining({ status: 'skipped', startedAt: null }),
    });
  });

  it('skips a like notification when the activity owner liked their own activity', async () => {
    prisma.like.findUnique.mockResolvedValue({
      authorId: 'owner-1',
      activity: { id: 'activity-1', userId: 'owner-1' },
    });

    await worker.processNextJob();

    expect(notifications.sendLike).not.toHaveBeenCalled();
    expect(prisma.emailNotificationJob.update).toHaveBeenLastCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({ status: 'skipped' }),
    });
  });

  it('sends a comment email with the stored comment text', async () => {
    prisma.emailNotificationJob.findFirst.mockResolvedValue({
      id: 'job-2',
      notificationType: 'comment',
      sourceId: 'comment-1',
      attempts: 0,
    });
    prisma.comment.findUnique.mockResolvedValue({
      authorId: 'commenter-1',
      comment: 'Nice route',
      profile: makeProfileSummary({ profilePhoto: 'alice.jpg' }),
      activity: {
        id: 'activity-1',
        userId: 'owner-1',
        mapPhotoUrl: 'activity-map.jpg',
        profile: {
          userId: 'owner-1',
          name: 'Bob',
          surname: 'Owner',
          emailNotifications: true,
          user: { email: 'owner@example.com' },
        },
      },
    });

    await worker.processNextJob();

    expect(notifications.sendComment).toHaveBeenCalledWith(
      expect.objectContaining({
        activityId: 'activity-1',
        comment: 'Nice route',
        actorName: 'Alice',
        recipientEmail: 'owner@example.com',
      }),
    );
  });

  it('sends a comment-like email to the comment author', async () => {
    prisma.emailNotificationJob.findFirst.mockResolvedValue({
      id: 'job-3',
      notificationType: 'comment-like',
      sourceId: 'comment-like-1',
      attempts: 0,
    });
    prisma.commentLike.findUnique.mockResolvedValue({
      authorId: 'liker-1',
      profile: makeProfileSummary({ profilePhoto: 'alice.jpg' }),
      comment: {
        authorId: 'comment-author-1',
        comment: 'Great route',
        profile: {
          userId: 'comment-author-1',
          name: 'Carol',
          surname: 'Commenter',
          emailNotifications: true,
          user: { email: 'comment-author@example.com' },
        },
        activity: { id: 'activity-1' },
      },
    });

    await worker.processNextJob();

    expect(notifications.sendCommentLike).toHaveBeenCalledWith(
      expect.objectContaining({
        activityId: 'activity-1',
        comment: 'Great route',
        recipientEmail: 'comment-author@example.com',
        recipientName: 'Carol',
      }),
    );
  });

  it('sends a moderator report email with reporter details and the reported profile', async () => {
    prisma.emailNotificationJob.findFirst.mockResolvedValue({
      id: 'job-report',
      notificationType: 'moderation-report',
      sourceId: 'report-1',
      attempts: 0,
    });
    prisma.contentReport.findUnique.mockResolvedValue({
      id: 'report-1',
      targetId: 'reported-user',
      targetType: 'user',
      reason: 'harassment',
      details: 'Repeated unwanted messages',
      reporterId: 'reporter-1',
      subjectUserId: 'reported-user',
      reporter: { id: 'reporter-1', email: 'sam@example.com', profile: { name: 'Sam', surname: 'Reporter' } },
      subjectUser: {
        id: 'reported-user',
        email: 'alex@example.com',
        profile: makeProfileSummary({
          name: 'Alex',
          surname: 'Runner',
          bio: 'Runner profile',
          profilePhoto: 'profile.jpg',
        }),
      },
      activity: null,
      comment: null,
      media: null,
    });
    prisma.profile.findUnique.mockResolvedValue(
      makeProfileSummary({ name: 'Alex', surname: 'Runner', bio: 'Runner profile', profilePhoto: 'profile.jpg' }),
    );

    await worker.processNextJob();

    expect(notifications.sendModerationUpdate).toHaveBeenCalledWith({
      reportId: 'report-1',
      requestType: 'report',
      targetType: 'user',
      targetId: 'reported-user',
      reason: 'harassment',
      reporterDetails: 'Repeated unwanted messages',
      reporter: { id: 'reporter-1', email: 'sam@example.com', name: 'Sam', surname: 'Reporter' },
      reportedUser: { id: 'reported-user', email: 'alex@example.com', name: 'Alex', surname: 'Runner' },
      reportedContent: 'Runner profile',
      reportedMediaUrl: null,
      reportedProfile: makeProfileSummary({
        name: 'Alex',
        surname: 'Runner',
        bio: 'Runner profile',
        profilePhoto: 'profile.jpg',
      }),
    });
  });

  it('resolves the uploader and labels an automatic media review in the moderator email', async () => {
    prisma.emailNotificationJob.findFirst.mockResolvedValue({
      id: 'job-media-review',
      notificationType: 'moderation-report',
      sourceId: 'report-media-upload',
      attempts: 0,
    });
    prisma.contentReport.findUnique.mockResolvedValue({
      id: 'report-media-upload',
      targetId: 'asset-1',
      targetType: 'media_upload',
      reason: 'sexual_content',
      details: 'Автоматическая проверка NSFWJS: Porn=0.99. Кадров проверено: 18.',
      reporterId: null,
      subjectUserId: 'owner-1',
      reporter: null,
      subjectUser: null,
      mediaUpload: {
        owner: {
          id: 'owner-1',
          email: 'owner@example.com',
          profile: { name: 'Alex', surname: 'Runner', bio: null, profilePhoto: null },
        },
      },
      activity: null,
      comment: null,
      media: null,
    });

    await worker.processNextJob();

    expect(notifications.sendModerationUpdate).toHaveBeenCalledWith({
      reportId: 'report-media-upload',
      requestType: 'report',
      targetType: 'media_upload',
      targetId: 'asset-1',
      reason: 'sexual_content',
      reporterDetails: 'Автоматическая проверка NSFWJS: Porn=0.99. Кадров проверено: 18.',
      reporter: null,
      reportedUser: { id: 'owner-1', email: 'owner@example.com', name: 'Alex', surname: 'Runner' },
      reportedContent: null,
      reportedMediaUrl: null,
      reportedProfile: null,
    });
  });

  it('sends reporter receipts to the moderation mailbox without requiring email confirmation', async () => {
    prisma.emailNotificationJob.findFirst.mockResolvedValue({
      id: 'job-receipt',
      notificationType: 'reporter-receipt',
      sourceId: 'report-1',
      attempts: 0,
    });
    prisma.contentReport.findUnique.mockResolvedValue({
      id: 'report-1',
      targetType: 'activity',
      reason: 'spam',
      reporter: { profile: { language: 'russian' } },
    });

    await worker.processNextJob();

    expect(notifications.sendReporterModerationUpdate).toHaveBeenCalledWith({
      reportId: 'report-1',
      targetType: 'activity',
      reason: 'spam',
      requestType: 'received',
      locale: 'russian',
    });

    prisma.contentReport.findUnique.mockResolvedValue({
      id: 'report-2',
      targetType: 'comment',
      reason: 'other',
      reporter: { profile: { language: 'english' } },
    });
    await worker.processNextJob();

    expect(notifications.sendReporterModerationUpdate).toHaveBeenCalledTimes(2);
    expect(notifications.sendReporterModerationUpdate).toHaveBeenLastCalledWith({
      reportId: 'report-2',
      targetType: 'comment',
      reason: 'other',
      requestType: 'received',
      locale: 'english',
    });
    expect(prisma.emailNotificationJob.update).toHaveBeenLastCalledWith({
      where: { id: 'job-receipt' },
      data: expect.objectContaining({ status: 'sent' }),
    });
  });

  it.each([
    ['reject_report', 'not-confirmed'],
    ['restore_content', 'content-restored'],
    ['remove_content', 'confirmed'],
  ] as const)('sends a reporter decision for %s with outcome %s', async (action, outcome) => {
    prisma.emailNotificationJob.findFirst.mockResolvedValue({
      id: `job-${action}`,
      notificationType: 'reporter-decision',
      sourceId: 'moderation-action-1',
      attempts: 0,
    });
    prisma.moderationAction.findUnique.mockResolvedValue({
      action,
      report: {
        id: 'report-1',
        targetType: 'comment',
        reason: 'harassment',
        reporter: {
          email: 'reporter@example.com',
          emailConfirmedAt: new Date(),
          profile: { language: 'english' },
        },
      },
    });

    await worker.processNextJob();

    expect(notifications.sendReporterModerationUpdate).toHaveBeenLastCalledWith({
      reportId: 'report-1',
      targetType: 'comment',
      reason: 'harassment',
      requestType: 'decision',
      locale: 'english',
      outcome,
    });
  });

  it('sends the moderator email for a moderation appeal', async () => {
    prisma.emailNotificationJob.findFirst.mockResolvedValue({
      id: 'job-appeal',
      notificationType: 'moderation-appeal',
      sourceId: 'appeal-1',
      attempts: 0,
    });
    prisma.moderationAppeal.findUnique.mockResolvedValue({ report: { id: 'report-1', targetType: 'comment' } });

    await worker.processNextJob();

    expect(notifications.sendModerationUpdate).toHaveBeenCalledWith({
      reportId: 'report-1',
      appealId: 'appeal-1',
      requestType: 'appeal',
      targetType: 'comment',
      reason: 'appeal',
    });
  });

  it('skips notification delivery when the recipient disabled email notifications', async () => {
    prisma.like.findUnique.mockResolvedValue({
      authorId: 'liker-1',
      profile: { name: 'Alice' },
      activity: {
        id: 'activity-1',
        userId: 'owner-1',
        profile: {
          userId: 'owner-1',
          name: 'Bob',
          emailNotifications: false,
          user: { email: 'owner@example.com' },
        },
      },
    });

    await worker.processNextJob();

    expect(notifications.sendLike).not.toHaveBeenCalled();
    expect(prisma.emailNotificationJob.update).toHaveBeenLastCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({ status: 'skipped', startedAt: null }),
    });
  });

  it('requeues the job after a temporary SMTP failure', async () => {
    prisma.emailNotificationJob.findFirst.mockResolvedValue({
      id: 'job-4',
      notificationType: 'comment',
      sourceId: 'comment-1',
      attempts: 0,
    });
    prisma.comment.findUnique.mockResolvedValue({
      authorId: 'commenter-1',
      comment: 'Nice route',
      profile: { name: 'Alice' },
      activity: {
        id: 'activity-1',
        userId: 'owner-1',
        profile: {
          userId: 'owner-1',
          emailNotifications: true,
          user: { email: 'owner@example.com' },
        },
      },
    });
    notifications.sendComment.mockRejectedValue(new Error('SMTP unavailable'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await worker.processNextJob();

    expect(prisma.emailNotificationJob.update).toHaveBeenLastCalledWith({
      where: { id: 'job-4' },
      data: expect.objectContaining({
        status: 'queued',
        startedAt: null,
        finishedAt: null,
        availableAt: expect.any(Date),
        errorMessage: 'SMTP unavailable',
      }),
    });
  });

  it('marks the job failed after the final retry, including non-Error failures', async () => {
    prisma.emailNotificationJob.findFirst.mockResolvedValue({
      id: 'job-final-attempt',
      notificationType: 'activity-like',
      sourceId: 'like-1',
      attempts: 4,
    });
    prisma.like.findUnique.mockResolvedValue({
      authorId: 'liker-1',
      profile: { name: 'Alice' },
      activity: {
        id: 'activity-1',
        userId: 'owner-1',
        profile: {
          userId: 'owner-1',
          emailNotifications: true,
          user: { email: 'owner@example.com' },
        },
      },
    });
    notifications.sendLike.mockRejectedValue('SMTP rejected message');
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await worker.processNextJob();

    expect(prisma.emailNotificationJob.update).toHaveBeenLastCalledWith({
      where: { id: 'job-final-attempt' },
      data: expect.objectContaining({
        status: 'failed',
        availableAt: expect.any(Date),
        finishedAt: expect.any(Date),
        errorMessage: 'SMTP rejected message',
      }),
    });
  });
});
