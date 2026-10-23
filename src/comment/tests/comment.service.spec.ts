import { NotFoundException } from '@nestjs/common';
import { CommentService } from '../comment.service';
import { asyncMock, expectInternalServerError, transactionMock } from 'src/tests/helpers';

function createPrismaMock() {
  const prisma = {
    activity: { findUnique: asyncMock() },
    comment: {
      count: asyncMock(),
      findMany: asyncMock(),
      create: asyncMock(),
      delete: asyncMock(),
      update: asyncMock(),
      findUnique: asyncMock(),
    },
    commentLike: { create: asyncMock(), findUnique: asyncMock(), delete: asyncMock(), findMany: asyncMock() },
    profile: { findUnique: asyncMock() },
    emailNotificationJob: { create: asyncMock() },
    userBlock: { findFirst: asyncMock(), findMany: asyncMock() },
    notification: { create: asyncMock() },
    pushDeviceToken: { findFirst: asyncMock() },
    pushNotificationJob: { create: asyncMock() },
  };
  return Object.assign(prisma, { $transaction: transactionMock(prisma) });
}

describe('CommentService', () => {
  it('reads, creates, updates and deletes comments and comment likes', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const service = new CommentService(prisma as never, account as never, {} as never);
    const comment = { id: 'comment-1', comment: 'Hello' };
    const like = { id: 'comment-like-1' };
    prisma.activity.findUnique.mockResolvedValue({
      comments: [{ ...comment, commentLikes: [like] }],
      _count: { comments: 2 },
    });
    prisma.comment.count.mockResolvedValue(2);
    prisma.comment.create.mockResolvedValue(comment);
    prisma.comment.delete.mockResolvedValue(comment);
    prisma.comment.update.mockResolvedValue(comment);
    prisma.comment.findUnique.mockResolvedValue({
      moderationStatus: 'visible',
      comment: 'Hello',
      profile: { name: 'Ann', surname: 'Runner' },
      activity: { id: 'activity-1' },
      commentLikes: [like],
    });
    prisma.commentLike.create.mockResolvedValue(like);
    prisma.commentLike.delete.mockResolvedValue(like);

    await expect(service.getCommentsbyActivityId('activity-1', '10')).resolves.toEqual({
      comments: [{ ...comment, commentLike: [like] }],
      hasMore: false,
      nextCursor: null,
    });
    await expect(service.getCommentsLengthbyActivityId('activity-1')).resolves.toBe(2);
    prisma.activity.findUnique.mockResolvedValue({ userId: 'comment-owner' });
    prisma.profile.findUnique.mockResolvedValue({
      emailNotifications: true,
      inAppNotifications: true,
      pushNotifications: false,
      user: { email: 'owner@example.com' },
    });
    await expect(service.createCommentByActivityId({ comment: 'Hello' }, 'activity-1')).resolves.toBeUndefined();
    expect(prisma.emailNotificationJob.create).toHaveBeenCalledWith({
      data: { notificationType: 'comment', sourceId: 'comment-1', status: 'queued' },
    });
    await expect(service.deleteCommentByCommentId('comment-1')).resolves.toEqual(comment);
    await expect(service.updateCommentByCommentId('Updated', 'comment-1')).resolves.toEqual(comment);
    await expect(service.getCommentByCommentId('comment-1')).resolves.toEqual({
      profile: { name: 'Ann', surname: 'Runner' },
      comment: 'Hello',
    });
    await expect(service.createCommentLikeByCommentId({ commentId: 'comment-1' })).resolves.toEqual(like);
    await expect(service.deleteCommentLikeByLikeId('comment-like-1')).resolves.toEqual(like);
    await expect(service.getCommentLikesLengthByCommentId('comment-1')).resolves.toEqual([like]);
    expect(prisma.commentLike.findUnique).not.toHaveBeenCalled();
  });

  it('requests one extra comment and returns a cursor when another page exists', async () => {
    const prisma = createPrismaMock();
    const service = new CommentService(
      prisma as never,
      {} as never,
      { canAccessActivity: asyncMock().mockResolvedValue(true) } as never,
    );
    const firstComment = { id: 'comment-1', date: new Date('2026-08-20T10:00:00.000Z') };
    const secondComment = { id: 'comment-2', date: new Date('2026-08-20T09:00:00.000Z') };
    prisma.activity.findUnique.mockResolvedValue({ comments: [firstComment, secondComment] });

    await expect(
      service.getCommentsbyActivityId('activity-1', '1', {
        date: new Date('2026-08-20T11:00:00.000Z'),
        id: 'cursor-comment',
      }),
    ).resolves.toMatchObject({
      comments: [firstComment],
      hasMore: true,
      nextCursor: Buffer.from(
        JSON.stringify({ date: firstComment.date.toISOString(), id: firstComment.id }),
        'utf8',
      ).toString('base64url'),
    });
    expect(prisma.activity.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'activity-1' },
        select: {
          comments: expect.objectContaining({
            where: {
              moderationStatus: 'visible',
              OR: [
                { date: { lt: new Date('2026-08-20T11:00:00.000Z') } },
                { date: new Date('2026-08-20T11:00:00.000Z'), id: { lt: 'cursor-comment' } },
              ],
            },
            orderBy: [{ date: 'desc' }, { id: 'desc' }],
            take: 2,
          }),
        },
      }),
    );
  });

  it('creates an in-app notification when a user comments on another user activity', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1', name: 'Alice' }) };
    const activityService = {
      canAccessActivity: asyncMock().mockResolvedValue(true),
      canInteractWithActivity: asyncMock().mockResolvedValue(true),
    };
    const service = new CommentService(prisma as never, account as never, activityService as never);
    prisma.comment.create.mockResolvedValue({ id: 'comment-1' });
    prisma.activity.findUnique.mockResolvedValue({ userId: 'owner-1' });
    prisma.profile.findUnique.mockResolvedValue({
      emailNotifications: false,
      inAppNotifications: true,
      pushNotifications: false,
      user: { email: 'owner@example.com' },
    });

    await service.createCommentByActivityId({ comment: 'Nice run' }, 'activity-1', 'actor-1');

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientUserId: 'owner-1',
        actorUserId: 'actor-1',
        type: 'comment',
        sourceId: 'comment-1',
        targetType: 'activity',
        targetId: 'activity-1',
        relatedId: 'comment-1',
        content: 'Nice run',
        inApp: true,
      }),
      select: { id: true },
    });
  });

  it('selects comment fields and profile data without loading comment likes', async () => {
    const prisma = createPrismaMock();
    const service = new CommentService(
      prisma as never,
      {} as never,
      { canAccessActivity: asyncMock().mockResolvedValue(true) } as never,
    );
    prisma.activity.findUnique.mockResolvedValue({ comments: [] });

    await service.getCommentsbyActivityId('activity-1');

    const query = ((prisma.activity.findUnique.mock.calls as unknown[][])[0]?.[0] ?? {}) as {
      select?: { comments?: { select?: Record<string, unknown>; include?: unknown } };
      include?: unknown;
    };
    const commentQuery = query.select?.comments ?? {};
    expect(query.include).toBeUndefined();
    expect(commentQuery.include).toBeUndefined();
    expect(commentQuery.select).toEqual(
      expect.objectContaining({
        id: true,
        date: true,
        comment: true,
        authorId: true,
        activityId: true,
        profileId: true,
        profile: expect.any(Object),
      }),
    );
    expect(commentQuery.select).not.toHaveProperty('commentLike');
    expect(commentQuery.select).toHaveProperty('commentLikes', { select: { authorId: true, id: true } });
  });

  it('combines comment access and comment lookup into one query', async () => {
    const prisma = createPrismaMock();
    const service = new CommentService(
      prisma as never,
      {} as never,
      { canAccessActivity: asyncMock().mockResolvedValue(true) } as never,
    );
    prisma.comment.findUnique.mockResolvedValue({
      moderationStatus: 'visible',
      comment: 'Hello',
      profile: { name: 'Ann', surname: 'Runner' },
      activity: { id: 'activity-1' },
    });

    await expect(service.getCommentByCommentId('comment-1', 'owner-1')).resolves.toEqual({
      profile: { name: 'Ann', surname: 'Runner' },
      comment: 'Hello',
    });
    expect(prisma.comment.findUnique).toHaveBeenCalledTimes(1);
  });

  it('combines comment access and comment likes lookup into one query', async () => {
    const prisma = createPrismaMock();
    const service = new CommentService(
      prisma as never,
      {} as never,
      { canAccessActivity: asyncMock().mockResolvedValue(true) } as never,
    );
    prisma.comment.findUnique.mockResolvedValue({
      moderationStatus: 'visible',
      activity: { id: 'activity-1' },
      commentLikes: [{ id: 'like-1', authorId: 'author-1' }],
    });

    await expect(service.getCommentLikesLengthByCommentId('comment-1', 'owner-1')).resolves.toEqual([
      { id: 'like-1', authorId: 'author-1' },
    ]);
    expect(prisma.comment.findUnique).toHaveBeenCalledTimes(1);
  });

  it('filters blocked authors from comment lists, counts, and likes', async () => {
    const prisma = createPrismaMock();
    const activityService = { canAccessActivity: asyncMock().mockResolvedValue(true) };
    const moderationAccess = {
      areBlocked: asyncMock().mockResolvedValue(false),
      blockedUserIds: asyncMock().mockResolvedValue(['blocked-user']),
    };
    const service = new CommentService(
      prisma as never,
      {} as never,
      activityService as never,
      undefined,
      moderationAccess as never,
    );
    prisma.activity.findUnique.mockResolvedValue({ comments: [{ id: 'comment-1', commentLikes: [] }] });
    prisma.comment.count.mockResolvedValue(1);
    prisma.comment.findUnique.mockResolvedValue({
      authorId: 'comment-author',
      moderationStatus: 'visible',
      activity: { id: 'activity-1' },
      commentLikes: [{ id: 'like-1', authorId: 'visible-user' }],
    });

    await service.getCommentsbyActivityId('activity-1', '10', undefined, 'viewer-1');
    expect(prisma.activity.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          comments: expect.objectContaining({
            where: expect.objectContaining({
              moderationStatus: 'visible',
              authorId: { notIn: ['blocked-user'] },
            }),
            select: expect.objectContaining({
              commentLikes: {
                where: { authorId: { notIn: ['blocked-user'] } },
                select: { authorId: true, id: true },
              },
            }),
          }),
        },
      }),
    );
    await expect(service.getCommentsLengthbyActivityId('activity-1', 'viewer-1')).resolves.toBe(1);
    expect(prisma.comment.count).toHaveBeenCalledWith({
      where: { activityId: 'activity-1', moderationStatus: 'visible', authorId: { notIn: ['blocked-user'] } },
    });
    await expect(service.getCommentLikesLengthByCommentId('comment-1', 'viewer-1')).resolves.toEqual([
      { id: 'like-1', authorId: 'visible-user' },
    ]);
    expect(prisma.comment.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          commentLikes: { where: { authorId: { notIn: ['blocked-user'] } }, select: { authorId: true, id: true } },
        }),
      }),
    );

    moderationAccess.areBlocked.mockResolvedValue(true);
    await expect(service.getCommentByCommentId('comment-1', 'viewer-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(activityService.canAccessActivity).toHaveBeenCalledTimes(3);
  });

  it('hides a moderated comment even from an anonymous direct request', async () => {
    const prisma = createPrismaMock();
    const service = new CommentService(prisma as never, {} as never, {} as never);
    prisma.comment.findUnique.mockResolvedValue({ moderationStatus: 'hidden' });

    await expect(service.getCommentByCommentId('comment-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.comment.findUnique).toHaveBeenCalledTimes(1);
  });

  it('returns not found when a comment author has no profile', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue(null) };
    const service = new CommentService(prisma as never, account as never, {} as never);

    await expect(service.createCommentByActivityId({ comment: 'Hello' }, 'activity-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.createCommentLikeByCommentId({ commentId: 'comment-1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.comment.create).not.toHaveBeenCalled();
    expect(prisma.commentLike.create).not.toHaveBeenCalled();
  });

  it('converts database failures from every operation to an internal server error', async () => {
    const prisma = createPrismaMock();
    const error = new Error('database unavailable');
    Object.values(prisma.activity).forEach((operation) => operation.mockRejectedValue(error));
    Object.values(prisma.comment).forEach((operation) => operation.mockRejectedValue(error));
    Object.values(prisma.commentLike).forEach((operation) => operation.mockRejectedValue(error));
    const service = new CommentService(
      prisma as never,
      { getAccountByUserId: asyncMock().mockRejectedValue(error) } as never,
      {} as never,
    );

    await expectInternalServerError(service.getCommentsbyActivityId('a1', '10'));
    await expectInternalServerError(service.getCommentsLengthbyActivityId('a1'));
    await expectInternalServerError(service.createCommentByActivityId({ comment: 'x' }, 'a1'));
    await expectInternalServerError(service.deleteCommentByCommentId('c1'));
    await expectInternalServerError(service.updateCommentByCommentId('x', 'c1'));
    await expectInternalServerError(service.getCommentByCommentId('c1'));
    await expectInternalServerError(service.createCommentLikeByCommentId({ commentId: 'c1' }));
    await expectInternalServerError(service.deleteCommentLikeByLikeId('cl1'));
    await expectInternalServerError(service.getCommentLikesLengthByCommentId('c1'));
  });
});
