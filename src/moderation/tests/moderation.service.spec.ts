import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { asyncMock, transactionMock } from 'src/tests/helpers';
import { EMAIL_NOTIFICATION_JOB_STATUS, EMAIL_NOTIFICATION_TYPE } from 'src/email/email-notification.constants';
import { NOTIFICATION_TYPE } from 'src/notification/notification.constants';
import { ModerationService } from '../moderation.service';

function createPrismaMock() {
  const prisma = {
    user: { findUnique: asyncMock(), update: asyncMock() },
    activity: { findUnique: asyncMock(), update: asyncMock() },
    activityMedia: { findUnique: asyncMock(), update: asyncMock() },
    comment: { findUnique: asyncMock(), update: asyncMock() },
    contentReport: {
      create: asyncMock(),
      findFirst: asyncMock(),
      findMany: asyncMock(),
      findUnique: asyncMock(),
      update: asyncMock(),
      updateMany: asyncMock(),
    },
    mediaModerationAsset: { findUnique: asyncMock() },
    moderationAction: {
      create: asyncMock().mockResolvedValue({ id: 'moderation-action-1' }),
      findFirst: asyncMock(),
      findMany: asyncMock(),
    },
    moderationAppeal: {
      create: asyncMock(),
      findFirst: asyncMock(),
      findMany: asyncMock(),
      findUnique: asyncMock(),
      updateMany: asyncMock(),
    },
    userBlock: { deleteMany: asyncMock(), findMany: asyncMock(), upsert: asyncMock() },
    friend: { deleteMany: asyncMock() },
    profile: { findMany: asyncMock(), findUnique: asyncMock() },
    notification: { create: asyncMock().mockResolvedValue({ id: 'notification-1' }) },
    pushNotificationJob: { create: asyncMock() },
    emailNotificationJob: { create: asyncMock() },
  };
  return Object.assign(prisma, { $transaction: transactionMock(prisma) });
}

describe('ModerationService', () => {
  it('creates one report and queues a moderator email without exposing the reporter in the email job', async () => {
    const prisma = createPrismaMock();
    const service = new ModerationService(prisma as never, {} as never);
    const createdReport = { id: 'report-1', status: 'open', createdAt: new Date() };
    prisma.activity.findUnique.mockResolvedValue({ id: 'activity-1', userId: 'author-1', moderationStatus: 'visible' });
    prisma.contentReport.findFirst.mockResolvedValue(null);
    prisma.contentReport.create.mockResolvedValue(createdReport);
    prisma.profile.findUnique.mockResolvedValue({
      emailNotifications: false,
      inAppNotifications: false,
      pushNotifications: false,
      language: 'russian',
      user: { email: 'reporter@example.com', emailConfirmedAt: new Date() },
    });

    await expect(
      service.submitReport('reporter-1', {
        targetType: 'activity',
        targetId: 'activity-1',
        reason: 'threats',
        details: '  A threat  ',
      }),
    ).resolves.toBe(createdReport);
    expect(prisma.contentReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reporterId: 'reporter-1',
        targetType: 'activity',
        targetId: 'activity-1',
        activityId: 'activity-1',
        subjectUserId: 'author-1',
        reason: 'threats',
        details: 'A threat',
      }),
      select: { id: true, status: true, createdAt: true },
    });
    expect(prisma.emailNotificationJob.create).toHaveBeenCalledWith({
      data: {
        notificationType: EMAIL_NOTIFICATION_TYPE.moderationReport,
        sourceId: 'report-1',
        status: EMAIL_NOTIFICATION_JOB_STATUS.queued,
      },
    });
    expect(prisma.emailNotificationJob.create).toHaveBeenCalledWith({
      data: {
        notificationType: EMAIL_NOTIFICATION_TYPE.reporterReceipt,
        sourceId: 'report-1',
        status: EMAIL_NOTIFICATION_JOB_STATUS.queued,
      },
    });
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: NOTIFICATION_TYPE.moderationReportReceived,
          inApp: true,
          content: expect.stringContaining('Жалоба №report-1'),
        }),
      }),
    );
  });

  it('returns an open duplicate report and rejects missing, hidden, and self-owned targets', async () => {
    const prisma = createPrismaMock();
    const service = new ModerationService(prisma as never, {} as never);
    const duplicate = { id: 'report-existing', status: 'open', createdAt: new Date() };
    prisma.activity.findUnique.mockResolvedValue({ userId: 'author-1', moderationStatus: 'visible' });
    prisma.contentReport.findFirst.mockResolvedValue(duplicate);
    await expect(
      service.submitReport('reporter-1', { targetType: 'activity', targetId: 'activity-1', reason: 'spam' }),
    ).resolves.toBe(duplicate);
    expect(prisma.contentReport.create).not.toHaveBeenCalled();

    prisma.contentReport.findFirst.mockResolvedValue(null);
    await expect(
      service.submitReport('author-1', { targetType: 'activity', targetId: 'activity-1', reason: 'spam' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    prisma.activity.findUnique.mockResolvedValue({ userId: 'author-1', moderationStatus: 'hidden' });
    await expect(
      service.submitReport('reporter-1', { targetType: 'activity', targetId: 'activity-1', reason: 'spam' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.submitReport('reporter-1', { targetType: 'media_upload', targetId: 'asset-1', reason: 'spam' } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('blocks a user, removes both follow directions, and prevents self or missing-user blocks', async () => {
    const prisma = createPrismaMock();
    const service = new ModerationService(prisma as never, {} as never);
    prisma.user.findUnique.mockResolvedValue({ id: 'blocked-1' });

    await service.blockUser('blocker-1', 'blocked-1');

    expect(prisma.userBlock.upsert).toHaveBeenCalledWith({
      where: { blockerId_blockedId: { blockerId: 'blocker-1', blockedId: 'blocked-1' } },
      create: { blockerId: 'blocker-1', blockedId: 'blocked-1' },
      update: {},
    });
    expect(prisma.friend.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { userId: 'blocker-1', friendId: 'blocked-1' },
          { userId: 'blocked-1', friendId: 'blocker-1' },
        ],
      },
    });
    await expect(service.blockUser('same-user', 'same-user')).rejects.toBeInstanceOf(BadRequestException);
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.blockUser('blocker-1', 'missing-user')).rejects.toBeInstanceOf(NotFoundException);
  });

  it("lists blocked profiles, handles empty lists, and unblocks only the requesting user's row", async () => {
    const prisma = createPrismaMock();
    const service = new ModerationService(prisma as never, {} as never);
    const createdAt = new Date();
    prisma.userBlock.findMany.mockResolvedValue([{ blockedId: 'blocked-1', createdAt }]);
    prisma.profile.findMany.mockResolvedValue([{ userId: 'blocked-1', name: 'Runner' }]);

    await expect(service.getBlockedUsers('owner-1')).resolves.toEqual({
      items: [{ blockedUserId: 'blocked-1', createdAt, profile: { userId: 'blocked-1', name: 'Runner' } }],
    });
    expect(prisma.profile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: { in: ['blocked-1'] } } }),
    );
    prisma.userBlock.findMany.mockResolvedValue([]);
    await expect(service.getBlockedUsers('owner-1')).resolves.toEqual({ items: [] });
    prisma.userBlock.findMany.mockResolvedValue([{ blockedId: 'deleted-user', createdAt }]);
    prisma.profile.findMany.mockResolvedValue([]);
    await expect(service.getBlockedUsers('owner-1')).resolves.toEqual({
      items: [{ blockedUserId: 'deleted-user', createdAt, profile: null }],
    });
    await service.unblockUser('owner-1', 'blocked-1');
    expect(prisma.userBlock.deleteMany).toHaveBeenCalledWith({
      where: { blockerId: 'owner-1', blockedId: 'blocked-1' },
    });
  });

  it('queries the queue by priority before applying the page limit', async () => {
    const prisma = createPrismaMock();
    const service = new ModerationService(prisma as never, {} as never);
    const queue = [{ id: 'urgent-1', priority: 'urgent' }];
    prisma.contentReport.findMany.mockResolvedValue(queue);

    await expect(service.getReportQueue(undefined, 5)).resolves.toBe(queue);
    expect(prisma.contentReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ['open', 'in_review', 'appealed'] } },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        take: 5,
      }),
    );
    await service.getReportQueue();
    expect(prisma.contentReport.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { status: { in: ['open', 'in_review', 'appealed'] } }, take: 50 }),
    );
  });

  it('returns report context, signed media preview, and the action audit trail', async () => {
    const prisma = createPrismaMock();
    const storage = { getQuarantinePreviewUrl: asyncMock().mockResolvedValue('signed-preview') };
    const service = new ModerationService(prisma as never, storage as never);
    const report = { id: 'report-1', targetType: 'media_upload', targetId: 'asset-1' };
    const actions = [{ action: 'reject_media' }];
    prisma.contentReport.findUnique.mockResolvedValueOnce(report).mockResolvedValue(null);
    prisma.mediaModerationAsset.findUnique.mockResolvedValue({
      quarantineKey: 'moderation-quarantine/owner-1/asset-1.jpg',
      ownerId: 'owner-1',
      status: 'review_required',
      scores: { Porn: 0.9 },
      frameCount: null,
      modelVersion: 'nsfwjs-2.4.2',
      contentType: 'image/webp',
    });
    prisma.moderationAction.findMany.mockResolvedValue(actions);

    await expect(service.getReportDetails('report-1')).resolves.toEqual({
      report,
      context: expect.objectContaining({
        url: 'signed-preview',
        userId: 'owner-1',
        moderationStatus: 'review_required',
      }),
      actions,
    });
    expect(storage.getQuarantinePreviewUrl).toHaveBeenCalledWith('moderation-quarantine/owner-1/asset-1.jpg');
    await expect(service.getReportDetails('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hides reported comments and records the moderator action in the same transaction', async () => {
    const prisma = createPrismaMock();
    const service = new ModerationService(prisma as never, {} as never);
    const report = {
      id: 'report-1',
      status: 'open',
      targetType: 'comment',
      targetId: 'comment-1',
      subjectUserId: 'author-1',
    };
    prisma.contentReport.findUnique
      .mockResolvedValueOnce(report)
      .mockResolvedValueOnce({ ...report, status: 'resolved' });
    prisma.contentReport.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.applyAction('report-1', 'moderator-1', { action: 'hide_content', note: '  review  ' }),
    ).resolves.toMatchObject({
      status: 'resolved',
    });
    expect(prisma.comment.update).toHaveBeenCalledWith({
      where: { id: 'comment-1' },
      data: { moderationStatus: 'hidden' },
    });
    expect(prisma.moderationAction.create).toHaveBeenCalledWith({
      data: { reportId: 'report-1', actorId: 'moderator-1', action: 'hide_content', note: 'review' },
    });
    expect(prisma.contentReport.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'resolved', assignedModeratorId: 'moderator-1' }),
      }),
    );
  });

  it('validates moderation actions and applies temporary account suspensions', async () => {
    const prisma = createPrismaMock();
    const service = new ModerationService(prisma as never, {} as never);
    const userReport = {
      id: 'report-1',
      status: 'open',
      targetType: 'user',
      targetId: 'user-2',
      subjectUserId: 'user-2',
    };
    prisma.contentReport.findUnique.mockResolvedValue(userReport);
    prisma.contentReport.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.applyAction('report-1', 'mod-1', { action: 'temporary_suspend' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await service.applyAction('report-1', 'mod-1', { action: 'temporary_suspend', suspensionDays: 7 });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: { bannedUntil: expect.any(Date) },
    });
    prisma.contentReport.findUnique.mockResolvedValue({ ...userReport, status: 'resolved' });
    await expect(service.applyAction('report-1', 'mod-1', { action: 'warn_user' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('submits and decides appeals, restoring content when an appeal is upheld', async () => {
    const prisma = createPrismaMock();
    const service = new ModerationService(prisma as never, {} as never);
    const report = {
      id: 'report-1',
      status: 'resolved',
      targetType: 'activity',
      targetId: 'activity-1',
      subjectUserId: 'author-1',
    };
    const appeal = {
      id: 'appeal-1',
      reportId: 'report-1',
      appellantId: 'author-1',
      status: 'pending',
      createdAt: new Date(),
    };
    prisma.contentReport.findUnique.mockResolvedValue(report);
    prisma.moderationAppeal.findFirst.mockResolvedValue(null);
    prisma.contentReport.updateMany.mockResolvedValue({ count: 1 });
    prisma.moderationAppeal.create.mockResolvedValue(appeal);

    await expect(service.submitAppeal('report-1', 'author-1', 'Please review this decision')).resolves.toMatchObject({
      id: 'appeal-1',
      status: 'pending',
    });
    expect(prisma.emailNotificationJob.create).toHaveBeenCalledWith({
      data: {
        notificationType: EMAIL_NOTIFICATION_TYPE.moderationAppeal,
        sourceId: 'appeal-1',
        status: EMAIL_NOTIFICATION_JOB_STATUS.queued,
      },
    });
    await expect(service.submitAppeal('report-1', 'intruder', 'Please review this decision')).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    prisma.moderationAppeal.findUnique.mockResolvedValue(appeal);
    prisma.moderationAppeal.updateMany.mockResolvedValue({ count: 1 });
    prisma.moderationAction.findFirst.mockResolvedValue(null);
    prisma.moderationAppeal.findUnique
      .mockResolvedValueOnce(appeal)
      .mockResolvedValueOnce({ ...appeal, status: 'upheld' });
    prisma.moderationAppeal.findMany.mockResolvedValue([]);
    await expect(service.decideAppeal('appeal-1', 'moderator-1', { decision: 'upheld' })).resolves.toMatchObject({
      status: 'upheld',
    });
    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
      data: { moderationStatus: 'visible' },
    });
    await expect(service.getAppealQueue(3)).resolves.toEqual([]);
  });

  it('creates reports for comments, media, and user profiles with the matching target reference', async () => {
    const prisma = createPrismaMock();
    const service = new ModerationService(prisma as never, {} as never);
    prisma.contentReport.findFirst.mockResolvedValue(null);
    prisma.contentReport.create.mockResolvedValue({ id: 'report-1' });
    prisma.comment.findUnique.mockResolvedValue({ authorId: 'comment-author', moderationStatus: 'visible' });
    prisma.activityMedia.findUnique.mockResolvedValue({ userId: 'media-author', moderationStatus: 'visible' });
    prisma.user.findUnique.mockResolvedValue({ id: 'profile-author' });

    const cases = [
      { targetType: 'comment', targetId: 'comment-1', ownerId: 'comment-author', targetField: 'commentId' },
      { targetType: 'media', targetId: 'media-1', ownerId: 'media-author', targetField: 'mediaId' },
      { targetType: 'user', targetId: 'profile-author', ownerId: 'profile-author', targetField: 'targetUserId' },
    ] as const;

    for (const { targetType, targetId, ownerId, targetField } of cases) {
      await service.submitReport('reporter-1', { targetType, targetId, reason: 'harassment' });
      expect(prisma.contentReport.create).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ [targetField]: targetId, subjectUserId: ownerId, details: null }),
        select: { id: true, status: true, createdAt: true },
      });
    }
  });

  it('returns context for each report target and tolerates a deleted quarantine asset', async () => {
    const prisma = createPrismaMock();
    const storage = { getQuarantinePreviewUrl: asyncMock().mockResolvedValue('signed-preview') };
    const service = new ModerationService(prisma as never, storage as never);
    prisma.activity.findUnique.mockResolvedValue({ title: 'Run' });
    prisma.comment.findUnique.mockResolvedValue({ comment: 'Hello' });
    prisma.activityMedia.findUnique.mockResolvedValue({ url: 'image-url' });
    prisma.profile.findUnique.mockResolvedValue({ userId: 'target-1' });
    prisma.moderationAction.findMany.mockResolvedValue([]);
    prisma.mediaModerationAsset.findUnique.mockResolvedValue(null);

    for (const targetType of ['activity', 'comment', 'media', 'user', 'media_upload']) {
      prisma.contentReport.findUnique.mockResolvedValueOnce({ id: targetType, targetId: 'target-1', targetType });
      await expect(service.getReportDetails(targetType)).resolves.toMatchObject({
        report: { targetType },
        actions: [],
      });
    }

    prisma.contentReport.findUnique.mockResolvedValue({ id: 'activity', targetId: 'target-1', targetType: 'activity' });
    prisma.activity.findUnique.mockResolvedValue(null);
    await expect(service.getReportDetails('activity')).resolves.toMatchObject({ context: null });
    prisma.contentReport.findUnique.mockResolvedValueOnce(null);
    await expect(service.getReportDetails('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('validates moderator actions and records content decisions for each supported target type', async () => {
    const prisma = createPrismaMock();
    const storage = { approveModerationAsset: asyncMock(), rejectModerationAsset: asyncMock() };
    const service = new ModerationService(prisma as never, storage as never);
    const report = {
      id: 'report-1',
      reporterId: 'reporter-1',
      status: 'open',
      targetType: 'activity',
      targetId: 'target-1',
      subjectUserId: 'owner-1',
    };
    prisma.profile.findUnique.mockResolvedValue({
      emailNotifications: false,
      inAppNotifications: false,
      pushNotifications: false,
      language: 'russian',
      user: { email: 'reporter@example.com', emailConfirmedAt: new Date() },
    });
    prisma.contentReport.findUnique.mockResolvedValue(report);
    prisma.contentReport.updateMany.mockResolvedValue({ count: 1 });

    prisma.contentReport.findUnique.mockResolvedValueOnce(null);
    await expect(service.applyAction('missing', 'mod-1', { action: 'reject_report' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.contentReport.findUnique.mockResolvedValueOnce({ ...report, status: 'resolved' });
    await expect(service.applyAction('report-1', 'mod-1', { action: 'reject_report' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(service.applyAction('report-1', 'mod-1', { action: 'appeal_rejected' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.applyAction('report-1', 'mod-1', { action: 'approve_media' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    prisma.contentReport.findUnique.mockResolvedValueOnce({ ...report, targetType: 'user', subjectUserId: null });
    await expect(
      service.applyAction('report-1', 'mod-1', { action: 'temporary_suspend', suspensionDays: 3 }),
    ).rejects.toBeInstanceOf(BadRequestException);

    for (const [targetType, action, expectedStatus] of [
      ['activity', 'remove_content', 'removed'],
      ['media', 'restore_content', 'visible'],
    ] as const) {
      prisma.contentReport.findUnique.mockResolvedValue({ ...report, targetType });
      await service.applyAction('report-1', 'mod-1', { action });
      const update = targetType === 'activity' ? prisma.activity.update : prisma.activityMedia.update;
      expect(update).toHaveBeenLastCalledWith({
        where: { id: 'target-1' },
        data: { moderationStatus: expectedStatus },
      });
    }
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: NOTIFICATION_TYPE.moderationReportDecision,
          inApp: true,
          content: expect.stringContaining('рассмотрена'),
        }),
      }),
    );

    prisma.contentReport.findUnique.mockResolvedValue({ ...report, targetType: 'user', subjectUserId: null });
    await expect(service.applyAction('report-1', 'mod-1', { action: 'permanent_suspend' })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    prisma.contentReport.findUnique.mockResolvedValue(report);
    prisma.contentReport.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.applyAction('report-1', 'mod-1', { action: 'reject_report' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects invalid appeals and handles upheld, rejected, and concurrent decisions', async () => {
    const prisma = createPrismaMock();
    const service = new ModerationService(prisma as never, {} as never);
    const report = {
      id: 'report-1',
      status: 'resolved',
      targetType: 'user',
      targetId: 'user-2',
      subjectUserId: 'user-2',
    };
    const appeal = { id: 'appeal-1', reportId: 'report-1', appellantId: 'user-2', status: 'pending' };
    prisma.contentReport.findUnique.mockResolvedValue(report);
    prisma.moderationAppeal.findFirst.mockResolvedValue(null);
    prisma.contentReport.updateMany.mockResolvedValue({ count: 1 });
    prisma.moderationAppeal.create.mockResolvedValue(appeal);

    prisma.contentReport.findUnique.mockResolvedValueOnce(null);
    await expect(service.submitAppeal('missing', 'user-2', 'reason')).rejects.toBeInstanceOf(NotFoundException);
    prisma.contentReport.findUnique.mockResolvedValueOnce({ ...report, status: 'open' });
    await expect(service.submitAppeal('report-1', 'user-2', 'reason')).rejects.toBeInstanceOf(ConflictException);
    prisma.moderationAppeal.findFirst.mockResolvedValue({ id: 'pending-appeal' });
    await expect(service.submitAppeal('report-1', 'user-2', 'reason')).rejects.toBeInstanceOf(ConflictException);
    prisma.moderationAppeal.findFirst.mockResolvedValue(null);

    prisma.moderationAppeal.findUnique.mockResolvedValueOnce(null);
    await expect(service.decideAppeal('missing', 'mod-1', { decision: 'rejected' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.moderationAppeal.findUnique.mockResolvedValueOnce({ ...appeal, status: 'upheld' });
    await expect(service.decideAppeal('appeal-1', 'mod-1', { decision: 'rejected' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    prisma.moderationAppeal.findUnique.mockResolvedValue(appeal);
    prisma.contentReport.findUnique.mockResolvedValue(null);
    await expect(service.decideAppeal('appeal-1', 'mod-1', { decision: 'rejected' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.contentReport.findUnique.mockResolvedValue(report);
    prisma.moderationAppeal.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.decideAppeal('appeal-1', 'mod-1', { decision: 'rejected' })).rejects.toBeInstanceOf(
      ConflictException,
    );

    prisma.moderationAppeal.updateMany.mockResolvedValue({ count: 1 });
    prisma.moderationAction.findFirst.mockResolvedValue({ id: 'suspension-1' });
    prisma.moderationAppeal.findUnique
      .mockResolvedValueOnce(appeal)
      .mockResolvedValueOnce({ ...appeal, status: 'upheld' });
    await service.decideAppeal('appeal-1', 'mod-1', { decision: 'upheld' });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-2' }, data: { bannedUntil: null } });

    prisma.moderationAction.findFirst.mockResolvedValue(null);
    prisma.moderationAppeal.findUnique
      .mockResolvedValueOnce(appeal)
      .mockResolvedValueOnce({ ...appeal, status: 'rejected' });
    await service.decideAppeal('appeal-1', 'mod-1', { decision: 'rejected' });
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });

  it('applies media decisions and permanent suspensions while rejecting unsupported targets', async () => {
    const prisma = createPrismaMock();
    const storage = {
      approveModerationAsset: asyncMock(),
      rejectModerationAsset: asyncMock(),
    };
    const service = new ModerationService(prisma as never, storage as never);
    const mediaReport = {
      id: 'report-media',
      status: 'open',
      targetType: 'media_upload',
      targetId: 'asset-1',
      subjectUserId: 'owner-1',
    };
    prisma.contentReport.findUnique.mockResolvedValue(mediaReport);
    prisma.contentReport.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.applyAction('report-media', 'moderator-1', { action: 'hide_content' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await service.applyAction('report-media', 'moderator-1', { action: 'approve_media', note: 'approved' });
    expect(storage.approveModerationAsset).toHaveBeenCalledWith('asset-1', 'moderator-1', 'approved');
    await service.applyAction('report-media', 'moderator-1', { action: 'reject_media' });
    expect(storage.rejectModerationAsset).toHaveBeenCalledWith('asset-1', 'moderator-1', undefined);

    const userReport = {
      ...mediaReport,
      id: 'report-user',
      targetType: 'user',
      targetId: 'user-2',
      subjectUserId: 'user-2',
    };
    prisma.contentReport.findUnique.mockResolvedValue(userReport);
    await service.applyAction('report-user', 'moderator-1', { action: 'permanent_suspend' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: { bannedUntil: new Date('9999-12-31T23:59:59.999Z') },
    });
    await expect(service.applyAction('report-user', 'moderator-1', { action: 'hide_content' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects reports for deleted comment, media, and user targets', async () => {
    const prisma = createPrismaMock();
    const service = new ModerationService(prisma as never, {} as never);
    prisma.comment.findUnique.mockResolvedValue(null);
    prisma.activityMedia.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);

    for (const [targetType, targetId] of [
      ['comment', 'missing-comment'],
      ['media', 'missing-media'],
      ['user', 'missing-user'],
    ] as const) {
      await expect(service.submitReport('reporter-1', { targetType, targetId, reason: 'spam' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    }
    expect(prisma.contentReport.create).not.toHaveBeenCalled();
  });

  it('handles appeal submission races and upheld user appeals without a suspension action', async () => {
    const prisma = createPrismaMock();
    const service = new ModerationService(prisma as never, {} as never);
    const report = {
      id: 'report-1',
      status: 'resolved',
      targetType: 'user',
      targetId: 'user-2',
      subjectUserId: 'user-2',
    };
    const appeal = { id: 'appeal-1', reportId: 'report-1', appellantId: 'user-2', status: 'pending' };
    prisma.contentReport.findUnique.mockResolvedValue(report);
    prisma.moderationAppeal.findFirst.mockResolvedValue(null);
    prisma.contentReport.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.submitAppeal('report-1', 'user-2', 'Please review this decision')).rejects.toBeInstanceOf(
      ConflictException,
    );

    prisma.contentReport.updateMany.mockResolvedValue({ count: 1 });
    prisma.moderationAppeal.findUnique
      .mockResolvedValueOnce(appeal)
      .mockResolvedValueOnce({ ...appeal, status: 'upheld' });
    prisma.moderationAppeal.updateMany.mockResolvedValue({ count: 1 });
    prisma.moderationAction.findFirst.mockResolvedValue(null);
    await expect(service.decideAppeal('appeal-1', 'moderator-1', { decision: 'upheld' })).resolves.toMatchObject({
      status: 'upheld',
    });
    expect(prisma.user.update).not.toHaveBeenCalled();

    await service.getAppealQueue();
    expect(prisma.moderationAppeal.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { status: 'pending' }, take: 50 }),
    );
  });
});
