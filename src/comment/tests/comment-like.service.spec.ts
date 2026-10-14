import { jest } from '@jest/globals';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { asyncMock, transactionMock } from 'src/tests/helpers';

import { CommentLikeService } from '../comment-like.service';

describe('CommentLikeService', () => {
  const prismaBase = {
    comment: { findUnique: asyncMock() },
    profile: { findUnique: asyncMock() },
    notification: { create: asyncMock() },
    pushDeviceToken: { findFirst: asyncMock() },
    pushNotificationJob: { create: asyncMock() },
    commentLike: {
      create: asyncMock(),
      delete: asyncMock(),
      findUnique: asyncMock(),
      findMany: asyncMock(),
    },
    emailNotificationJob: { create: asyncMock() },
  };
  const prisma = Object.assign(prismaBase, { $transaction: transactionMock(prismaBase) });
  const service = new CommentLikeService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a like and returns the existing like on a unique conflict', async () => {
    const like = { id: 'like-1' };
    prisma.commentLike.create.mockResolvedValue(like);
    prisma.comment.findUnique.mockResolvedValue({ authorId: 'owner-1', comment: 'Nice run', activityId: 'activity-1' });
    prisma.profile.findUnique
      .mockResolvedValueOnce({ name: 'Alice', surname: 'Runner', profilePhoto: 'avatar.jpg' })
      .mockResolvedValueOnce({
        emailNotifications: true,
        inAppNotifications: true,
        pushNotifications: false,
        user: { email: 'owner@example.com' },
      });

    await expect(service.create({ profileId: 'profile-1', authorId: 'user-1', commentId: 'comment-1' })).resolves.toBe(
      like,
    );
    expect(prisma.commentLike.create).toHaveBeenCalledWith({
      data: { profileId: 'profile-1', authorId: 'user-1', commentId: 'comment-1' },
    });
    expect(prisma.emailNotificationJob.create).toHaveBeenCalledWith({
      data: { notificationType: 'comment-like', sourceId: 'like-1', status: 'queued' },
    });

    prisma.commentLike.create.mockRejectedValue({ code: 'P2002' });
    prisma.commentLike.findUnique.mockResolvedValue(like);

    await expect(service.create({ profileId: 'profile-1', authorId: 'user-1', commentId: 'comment-1' })).resolves.toBe(
      like,
    );
  });

  it('rethrows non-unique create errors', async () => {
    const error = new Error('database unavailable');
    prisma.commentLike.create.mockRejectedValue(error);

    await expect(service.create({ profileId: 'profile-1', authorId: 'user-1', commentId: 'comment-1' })).rejects.toBe(
      error,
    );
  });

  it('creates an in-app notification for the author of a liked comment', async () => {
    prisma.commentLike.create.mockResolvedValue({ id: 'comment-like-1' });
    prisma.comment.findUnique.mockResolvedValue({
      authorId: 'comment-owner',
      comment: 'Good pace!',
      activityId: 'activity-1',
    });
    prisma.profile.findUnique
      .mockResolvedValueOnce({ name: 'Alice', surname: 'Runner', profilePhoto: 'avatar.jpg' })
      .mockResolvedValueOnce({
        emailNotifications: false,
        inAppNotifications: true,
        pushNotifications: false,
        user: { email: 'owner@example.com' },
      });

    await service.create({ profileId: 'profile-1', authorId: 'actor-1', commentId: 'comment-1' });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientUserId: 'comment-owner',
        actorUserId: 'actor-1',
        type: 'comment-like',
        sourceId: 'comment-like-1',
        targetType: 'activity',
        targetId: 'activity-1',
        relatedId: 'comment-1',
        content: 'Good pace!',
        actorName: 'Alice',
        actorSurname: 'Runner',
        actorProfilePhoto: 'avatar.jpg',
        inApp: true,
      }),
      select: { id: true },
    });
  });

  it('deletes a like with and without author ownership', async () => {
    prisma.commentLike.delete.mockResolvedValue({ id: 'like-1' });

    await expect(service.delete('like-1', 'user-1')).resolves.toEqual({ id: 'like-1' });
    expect(prisma.commentLike.delete).toHaveBeenCalledWith({ where: { id: 'like-1', authorId: 'user-1' } });

    await service.delete('like-1');
    expect(prisma.commentLike.delete).toHaveBeenLastCalledWith({ where: { id: 'like-1' } });
  });

  it('finds likes by comment', async () => {
    const likes = [{ id: 'like-1', authorId: 'user-1' }];
    prisma.commentLike.findMany.mockResolvedValue(likes);

    await expect(service.findByCommentId('comment-1')).resolves.toBe(likes);
    expect(prisma.commentLike.findMany).toHaveBeenCalledWith({
      where: { commentId: 'comment-1' },
      select: { authorId: true, id: true },
    });
  });
});
