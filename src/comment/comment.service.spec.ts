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
    commentLike: { create: asyncMock(), delete: asyncMock(), findMany: asyncMock() },
  };
}

describe('CommentService', () => {
  it('reads, creates, updates and deletes comments and comment likes', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const service = new CommentService(prisma as never, account as never, {} as never);
    const comment = { id: 'comment-1', comment: 'Hello' };
    const like = { id: 'comment-like-1', authorId: 'user-1' };
    prisma.comment.count.mockResolvedValue(2);
    prisma.comment.findMany.mockResolvedValue([comment]);
    prisma.comment.create.mockResolvedValue(comment);
    prisma.comment.delete.mockResolvedValue(comment);
    prisma.comment.update.mockResolvedValue(comment);
    prisma.comment.findUnique.mockResolvedValue({
      profile: { users: { email: 'user@example.com' } },
      comment: 'Hello',
    });
    prisma.commentLike.create.mockResolvedValue(like);
    prisma.commentLike.delete.mockResolvedValue(like);
    prisma.commentLike.findMany.mockResolvedValue([like]);

    await expect(service.getCommentsbyActivityId('activity-1', '10')).resolves.toEqual({
      comments: [comment],
      allCommentsLength: 2,
    });
    await expect(service.getCommentsLengthbyActivityId('activity-1')).resolves.toBe(2);
    await expect(
      service.createCommentByActivityId({ comment: 'Hello', authorId: 'user-1' }, 'activity-1'),
    ).resolves.toBeUndefined();
    await expect(service.deleteCommentByCommentId('comment-1')).resolves.toEqual(comment);
    await expect(service.updateCommentByCommentId('Updated', 'comment-1')).resolves.toEqual(comment);
    await expect(service.getCommentByCommentId('comment-1')).resolves.toEqual({
      profile: { users: { email: 'user@example.com' } },
      email: 'user@example.com',
      comment: 'Hello',
    });
    await expect(service.createCommentLikeByCommentId({ commentId: 'comment-1', authorId: 'user-1' })).resolves.toEqual(
      like,
    );
    await expect(service.deleteCommentLikeByLikeId('comment-like-1')).resolves.toEqual(like);
    await expect(service.getCommentLikesLengthByCommentId('comment-1')).resolves.toEqual([like]);
  });

  it('returns not found when a comment author has no profile', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue(null) };
    const service = new CommentService(prisma as never, account as never, {} as never);

    await expect(
      service.createCommentByActivityId({ comment: 'Hello', authorId: 'user-1' }, 'activity-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.createCommentLikeByCommentId({ commentId: 'comment-1', authorId: 'user-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.comment.create).not.toHaveBeenCalled();
    expect(prisma.commentLike.create).not.toHaveBeenCalled();
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
    await expectInternalServerError(service.createCommentByActivityId({ comment: 'x', authorId: 'u1' }, 'a1'));
    await expectInternalServerError(service.deleteCommentByCommentId('c1'));
    await expectInternalServerError(service.updateCommentByCommentId('x', 'c1'));
    await expectInternalServerError(service.getCommentByCommentId('c1'));
    await expectInternalServerError(service.createCommentLikeByCommentId({ commentId: 'c1', authorId: 'u1' }));
    await expectInternalServerError(service.deleteCommentLikeByLikeId('cl1'));
    await expectInternalServerError(service.getCommentLikesLengthByCommentId('c1'));
  });
});
