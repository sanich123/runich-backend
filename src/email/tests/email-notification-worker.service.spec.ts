import { Logger } from '@nestjs/common';
import { jest } from '@jest/globals';
import { EmailNotificationWorkerService } from '../email-notification-worker.service';
import { asyncMock } from 'src/tests/helpers';

describe('EmailNotificationWorkerService', () => {
  const prisma = {
    emailNotificationJob: { findFirst: asyncMock(), updateMany: asyncMock(), update: asyncMock() },
    like: { findUnique: asyncMock() },
    comment: { findUnique: asyncMock() },
    commentLike: { findUnique: asyncMock() },
  };
  const notifications = {
    sendLike: asyncMock(),
    sendComment: asyncMock(),
    sendCommentLike: asyncMock(),
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
  });

  afterEach(() => jest.restoreAllMocks());

  it('sends an activity-like email using the persisted actor and activity owner data', async () => {
    prisma.like.findUnique.mockResolvedValue({
      authorId: 'liker-1',
      profile: { name: 'Alice', surname: 'Runner', profilePhoto: 'alice.jpg' },
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
      profile: { name: 'Alice', surname: 'Runner', profilePhoto: 'alice.jpg' },
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
      profile: { name: 'Alice', surname: 'Runner', profilePhoto: 'alice.jpg' },
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
