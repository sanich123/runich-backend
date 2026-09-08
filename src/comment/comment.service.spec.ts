import { NotFoundException } from '@nestjs/common';
import { CommentService } from './comment.service';
import { asyncMock, expectInternalServerError } from 'src/__tests__/helpers';

function createPrismaMock() {
  return {
    comment: {
      count: asyncMock(),
      findMany: asyncMock(),
      create: asyncMock(),
      delete: asyncMock(),
      update: asyncMock(),
      findUnique: asyncMock(),
    },
    commentLike: { upsert: asyncMock(), findUnique: asyncMock(), delete: asyncMock(), findMany: asyncMock() },
  };
}

describe('CommentService', () => {
  it('reads, creates, updates and deletes comments and comment likes', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const service = new CommentService(prisma as never, account as never, {} as never);
    const comment = { id: 'comment-1', comment: 'Hello' };
    const like = { id: 'comment-like-1' };
    prisma.comment.count.mockResolvedValue(2);
    prisma.comment.findMany.mockResolvedValue([comment]);
    prisma.comment.create.mockResolvedValue(comment);
    prisma.comment.delete.mockResolvedValue(comment);
    prisma.comment.update.mockResolvedValue(comment);
    prisma.comment.findUnique.mockResolvedValue({
      profile: { user: { email: 'user@example.com' } },
      comment: 'Hello',
    });
    prisma.commentLike.upsert.mockResolvedValue(like);
    prisma.commentLike.findUnique.mockResolvedValue(like);
    prisma.commentLike.delete.mockResolvedValue(like);
    prisma.commentLike.findMany.mockResolvedValue([like]);

    await expect(service.getCommentsbyActivityId('activity-1', '10')).resolves.toEqual({
      comments: [comment],
      hasMore: false,
      nextCursor: null,
    });
    await expect(service.getCommentsLengthbyActivityId('activity-1')).resolves.toBe(2);
    await expect(service.createCommentByActivityId({ comment: 'Hello' }, 'activity-1')).resolves.toBeUndefined();
    await expect(service.deleteCommentByCommentId('comment-1')).resolves.toEqual(comment);
    await expect(service.updateCommentByCommentId('Updated', 'comment-1')).resolves.toEqual(comment);
    await expect(service.getCommentByCommentId('comment-1')).resolves.toEqual({
      profile: { user: { email: 'user@example.com' } },
      email: 'user@example.com',
      comment: 'Hello',
    });
    await expect(service.createCommentLikeByCommentId({ commentId: 'comment-1' })).resolves.toEqual(like);
    await expect(service.deleteCommentLikeByLikeId('comment-like-1')).resolves.toEqual(like);
    await expect(service.getCommentLikesLengthByCommentId('comment-1')).resolves.toEqual([like]);
  });

  it('requests one extra comment and returns a cursor when another page exists', async () => {
    const prisma = createPrismaMock();
    const service = new CommentService(prisma as never, {} as never, {} as never);
    const firstComment = { id: 'comment-1', date: new Date('2026-08-20T10:00:00.000Z') };
    const secondComment = { id: 'comment-2', date: new Date('2026-08-20T09:00:00.000Z') };
    prisma.comment.count.mockResolvedValue(2);
    prisma.comment.findMany.mockResolvedValue([firstComment, secondComment]);

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
    expect(prisma.comment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          activityId: 'activity-1',
          OR: [
            { date: { lt: new Date('2026-08-20T11:00:00.000Z') } },
            { date: new Date('2026-08-20T11:00:00.000Z'), id: { lt: 'cursor-comment' } },
          ],
        },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: 2,
      }),
    );
  });

  it('selects comment fields and profile data without loading comment likes', async () => {
    const prisma = createPrismaMock();
    const service = new CommentService(prisma as never, {} as never, {} as never);
    prisma.comment.findMany.mockResolvedValue([]);

    await service.getCommentsbyActivityId('activity-1');

    const query = ((prisma.comment.findMany.mock.calls as unknown[][])[0]?.[0] ?? {}) as {
      select?: Record<string, unknown>;
      include?: unknown;
    };
    expect(query.include).toBeUndefined();
    expect(query.select).toEqual(
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
    expect(query.select).not.toHaveProperty('commentLike');
    expect(query.select).not.toHaveProperty('commentLikes');
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
    expect(prisma.commentLike.upsert).not.toHaveBeenCalled();
  });

  it('converts database failures from every operation to an internal server error', async () => {
    const prisma = createPrismaMock();
    const error = new Error('database unavailable');
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
