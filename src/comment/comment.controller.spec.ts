import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';
import { asyncMock } from 'src/__tests__/helpers';

describe('CommentController', () => {
  const service = {
    getCommentsbyActivityId: asyncMock(),
    getCommentsLengthbyActivityId: asyncMock(),
    createCommentByActivityId: asyncMock(),
    deleteCommentByCommentId: asyncMock(),
    updateCommentByCommentId: asyncMock(),
    createCommentLikeByCommentId: asyncMock(),
    deleteCommentLikeByLikeId: asyncMock(),
    getCommentLikesLengthByCommentId: asyncMock(),
  };
  const controller = new CommentController(service as unknown as CommentService);

  beforeEach(() => jest.clearAllMocks());

  it('returns service results for every comment endpoint', async () => {
    const comment = { id: 'comment-1' };
    const like = { id: 'like-1' };
    service.getCommentsbyActivityId.mockResolvedValue({ comments: [comment], hasMore: false, nextCursor: null });
    service.getCommentsLengthbyActivityId.mockResolvedValue(1);
    service.createCommentByActivityId.mockResolvedValue(undefined);
    service.deleteCommentByCommentId.mockResolvedValue(comment);
    service.updateCommentByCommentId.mockResolvedValue(comment);
    service.createCommentLikeByCommentId.mockResolvedValue(like);
    service.deleteCommentLikeByLikeId.mockResolvedValue(like);
    service.getCommentLikesLengthByCommentId.mockResolvedValue([like]);

    await expect(controller.getCommentsByActivityId({ id: 'a1' }, '10')).resolves.toEqual({
      comments: [comment],
      hasMore: false,
      nextCursor: null,
    });
    await expect(controller.getCommentsLengthByActivityId({ id: 'a1' })).resolves.toBe(1);
    await expect(
      controller.postCommentWithActivityId({ comment: 'Hi' }, { id: 'a1' }, { user: { id: 'u1' } } as never),
    ).resolves.toBeUndefined();
    await expect(controller.deleteCommentWithCommentId({ id: 'c1' }, { user: { id: 'u1' } } as never)).resolves.toEqual(
      comment,
    );
    await expect(
      controller.updateCommentById({ comment: 'Updated' }, { id: 'c1' }, { user: { id: 'u1' } } as never),
    ).resolves.toEqual(comment);
    await expect(
      controller.postCommentLikeWithCommentId({ commentId: 'c1' }, { user: { id: 'u1' } } as never),
    ).resolves.toEqual(like);
    await expect(
      controller.deleteCommentLikeWithLikeId({ id: 'cl1' }, { user: { id: 'u1' } } as never),
    ).resolves.toEqual(like);
    await expect(controller.getCommentLikesLengthByCommentId({ id: 'c1' })).resolves.toEqual([like]);
  });

  it('propagates service errors from every comment endpoint', async () => {
    const error = new Error('service failed');
    Object.values(service).forEach((method) => method.mockRejectedValue(error));

    await expect(controller.getCommentsByActivityId({ id: 'a1' }, '10')).rejects.toBe(error);
    await expect(controller.getCommentsLengthByActivityId({ id: 'a1' })).rejects.toBe(error);
    await expect(
      controller.postCommentWithActivityId({ comment: 'Hi' }, { id: 'a1' }, { user: { id: 'u1' } } as never),
    ).rejects.toBe(error);
    await expect(controller.deleteCommentWithCommentId({ id: 'c1' }, { user: { id: 'u1' } } as never)).rejects.toBe(
      error,
    );
    await expect(
      controller.updateCommentById({ comment: 'Updated' }, { id: 'c1' }, { user: { id: 'u1' } } as never),
    ).rejects.toBe(error);
    await expect(
      controller.postCommentLikeWithCommentId({ commentId: 'c1' }, { user: { id: 'u1' } } as never),
    ).rejects.toBe(error);
    await expect(controller.deleteCommentLikeWithLikeId({ id: 'cl1' }, { user: { id: 'u1' } } as never)).rejects.toBe(
      error,
    );
    await expect(controller.getCommentLikesLengthByCommentId({ id: 'c1' })).rejects.toBe(error);
  });

  it('rejects malformed comment pagination before calling the service', async () => {
    await expect(controller.getCommentsByActivityId({ id: 'a1' }, 'NaN')).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.getCommentsByActivityId({ id: 'a1' }, '51')).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.getCommentsByActivityId({ id: 'a1' }, '10', 'not-a-cursor')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(service.getCommentsbyActivityId).not.toHaveBeenCalled();
  });
});
