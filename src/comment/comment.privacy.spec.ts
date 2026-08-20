import { NotFoundException } from '@nestjs/common';
import { CommentService } from './comment.service';
import { asyncMock } from 'src/__tests__/helpers';

describe('CommentService privacy', () => {
  it('does not expose comments for a private activity', async () => {
    const prisma = {
      comment: { count: asyncMock(), findMany: asyncMock() },
      commentLike: { findMany: asyncMock() },
    };
    const activityService = { canAccessActivity: asyncMock().mockResolvedValue(false) };
    const service = new CommentService(prisma as never, {} as never, activityService as never);

    await expect(service.getCommentsbyActivityId('activity-1', '10', undefined, 'viewer-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.comment.count).not.toHaveBeenCalled();
  });

  it('does not allow liking a comment on a private activity', async () => {
    const prisma = {
      comment: { findUnique: asyncMock() },
      commentLike: { upsert: asyncMock() },
    };
    prisma.comment.findUnique.mockResolvedValue({ activityId: 'activity-1' });
    const activityService = { canAccessActivity: asyncMock().mockResolvedValue(false) };
    const accountService = { getAccountByUserId: asyncMock() };
    const service = new CommentService(
      prisma as never,
      accountService as never,
      activityService as never,
      { create: prisma.commentLike.upsert } as never,
    );

    await expect(service.createCommentLikeByCommentId({ commentId: 'comment-1' }, 'viewer-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(accountService.getAccountByUserId).not.toHaveBeenCalled();
  });
});
