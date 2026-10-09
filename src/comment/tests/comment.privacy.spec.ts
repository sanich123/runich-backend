import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommentService } from '../comment.service';
import { asyncMock } from 'src/tests/helpers';

describe('CommentService privacy', () => {
  it('does not expose comments for a private activity', async () => {
    const prisma = {
      activity: { findUnique: asyncMock().mockResolvedValue(null) },
      comment: { count: asyncMock(), findMany: asyncMock() },
      commentLike: { findMany: asyncMock() },
    };
    const activityService = { canAccessActivity: asyncMock().mockResolvedValue(false) };
    const service = new CommentService(prisma as never, {} as never, activityService as never);

    await expect(service.getCommentsbyActivityId('activity-1', '10', undefined, 'viewer-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.activity.findUnique).not.toHaveBeenCalled();
    expect(prisma.comment.count).not.toHaveBeenCalled();
  });

  it('does not allow liking a comment on a private activity', async () => {
    const prisma = {
      comment: { findUnique: asyncMock() },
      commentLike: { create: asyncMock() },
    };
    prisma.comment.findUnique.mockResolvedValue({ activity: { id: 'activity-1' } });
    const activityService = { canAccessActivity: asyncMock().mockResolvedValue(false) };
    const accountService = { getAccountByUserId: asyncMock() };
    const service = new CommentService(
      prisma as never,
      accountService as never,
      activityService as never,
      { create: prisma.commentLike.create } as never,
    );

    await expect(service.createCommentLikeByCommentId({ commentId: 'comment-1' }, 'viewer-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(accountService.getAccountByUserId).not.toHaveBeenCalled();
  });

  it('rejects comments when external interactions are disabled', async () => {
    const prisma = {
      activity: { findUnique: asyncMock() },
      comment: { create: asyncMock() },
      commentLike: { findMany: asyncMock() },
    };
    const activityService = {
      canAccessActivity: asyncMock().mockResolvedValue(true),
      canInteractWithActivity: asyncMock().mockResolvedValue(false),
    };
    const accountService = { getAccountByUserId: asyncMock() };
    const service = new CommentService(prisma as never, accountService as never, activityService as never);

    await expect(
      service.createCommentByActivityId({ comment: 'Hello' }, 'activity-1', 'viewer-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.comment.create).not.toHaveBeenCalled();
    expect(accountService.getAccountByUserId).not.toHaveBeenCalled();
  });

  it('rejects deleting a comment that no longer exists', async () => {
    const prisma = { comment: { findUnique: asyncMock().mockResolvedValue(null), delete: asyncMock() } };
    const service = new CommentService(prisma as never, {} as never, {} as never);

    await expect(service.deleteCommentByCommentId('missing', 'owner-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.comment.delete).not.toHaveBeenCalled();
  });

  it('lets the activity owner delete another user comment but rejects unrelated users', async () => {
    const prisma = {
      comment: { findUnique: asyncMock(), delete: asyncMock() },
    };
    const service = new CommentService(prisma as never, {} as never, {} as never);
    prisma.comment.findUnique.mockResolvedValue({ authorId: 'comment-author', activity: { userId: 'activity-owner' } });
    prisma.comment.delete.mockResolvedValue({ id: 'comment-1' });

    await expect(service.deleteCommentByCommentId('comment-1', 'activity-owner')).resolves.toEqual({ id: 'comment-1' });
    await expect(service.deleteCommentByCommentId('comment-1', 'unrelated-user')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.comment.delete).toHaveBeenCalledTimes(1);
  });
});
