import { jest } from '@jest/globals';
import { ActivityPersistenceService } from '../../activity/activity-persistence.service';
import { CommentService } from '../../comment/comment.service';
import { FriendService } from '../../friend/friend.service';
import { LikeService } from '../../like/like.service';
import { UserService } from '../../user/user.service';

type TestMock = {
  (...args: unknown[]): unknown;
  mockResolvedValue(value: unknown): void;
};

const mock = () => jest.fn() as unknown as TestMock;

describe('ownership authorization', () => {
  it('scopes activity updates and deletes to the authenticated owner', async () => {
    const prisma = { activity: { update: mock(), delete: mock() } };
    prisma.activity.update.mockResolvedValue({ id: 'activity-1' });
    prisma.activity.delete.mockResolvedValue({ id: 'activity-1' });
    const service = new ActivityPersistenceService(prisma as never);

    await service.update('activity-1', 'owner-1', { title: 'updated' });
    await service.delete('activity-1', 'owner-1');

    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1', userId: 'owner-1' },
      data: { title: 'updated' },
    });
    expect(prisma.activity.delete).toHaveBeenCalledWith({ where: { id: 'activity-1', userId: 'owner-1' } });
  });

  it('scopes comment and comment-like mutations to their authors', async () => {
    const prisma = {
      comment: { update: mock(), delete: mock(), create: mock() },
      commentLike: { delete: mock(), create: mock() },
    };
    const account = { getAccountByUserId: mock() };
    account.getAccountByUserId.mockResolvedValue({ id: 'profile-1' });
    prisma.comment.update.mockResolvedValue({ id: 'comment-1' });
    prisma.comment.delete.mockResolvedValue({ id: 'comment-1' });
    prisma.commentLike.delete.mockResolvedValue({ id: 'comment-like-1' });
    const service = new CommentService(
      prisma as never,
      account as never,
      {} as never,
      {
        create: prisma.commentLike.create,
        delete: prisma.commentLike.delete,
      } as never,
    );

    await service.updateCommentByCommentId('text', 'comment-1', 'owner-1');
    await service.deleteCommentByCommentId('comment-1', 'owner-1');
    await service.deleteCommentLikeByLikeId('comment-like-1', 'owner-1');

    expect(prisma.comment.update).toHaveBeenCalledWith({
      where: { id: 'comment-1', authorId: 'owner-1' },
      data: { comment: 'text' },
    });
    expect(prisma.comment.delete).toHaveBeenCalledWith({ where: { id: 'comment-1', authorId: 'owner-1' } });
    expect(prisma.commentLike.delete).toHaveBeenCalledWith('comment-like-1', 'owner-1');
  });

  it('scopes like and friend deletion to the authenticated user', async () => {
    const likePrisma = { like: { delete: mock(), create: mock() } };
    likePrisma.like.delete.mockResolvedValue({ id: 'like-1' });
    const likeService = new LikeService(likePrisma as never, {} as never, {} as never);
    await likeService.deleteLikeById('like-1', 'owner-1');
    expect(likePrisma.like.delete).toHaveBeenCalledWith({ where: { id: 'like-1', authorId: 'owner-1' } });

    const friendPrisma = { friend: { delete: mock() } };
    friendPrisma.friend.delete.mockResolvedValue({ id: 'friend-1' });
    const friendService = new FriendService(friendPrisma as never, {} as never);
    await friendService.deleteFriendById('friend-1', 'owner-1');
    expect(friendPrisma.friend.delete).toHaveBeenCalledWith({ where: { id: 'friend-1', userId: 'owner-1' } });
  });

  it('scopes profile updates to the authenticated user', async () => {
    const prisma = { profile: { update: mock() } };
    prisma.profile.update.mockResolvedValue({ id: 'profile-1' });
    const service = new UserService(prisma as never);
    await service.updateProfileByProfileId('profile-1', 'owner-1', { name: 'New name' });
    expect(prisma.profile.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'profile-1', userId: 'owner-1' } }),
    );
  });

  it('rejects profile updates for another user', async () => {
    const prisma = { profile: { findUnique: mock(), upsert: mock() } };
    const service = new UserService(prisma as never);
    prisma.profile.findUnique.mockResolvedValue(null);

    await expect(service.updateProfileByUserId('owner-1', 'other-user', { name: 'Blocked' })).rejects.toMatchObject({
      status: 403,
    });
    expect(prisma.profile.upsert).not.toHaveBeenCalled();
  });
});
