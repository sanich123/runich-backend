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
    service.getCommentsbyActivityId.mockResolvedValue({ comments: [comment], allCommentsLength: 1 });
    service.getCommentsLengthbyActivityId.mockResolvedValue(1);
    service.createCommentByActivityId.mockResolvedValue(undefined);
    service.deleteCommentByCommentId.mockResolvedValue(comment);
    service.updateCommentByCommentId.mockResolvedValue(comment);
    service.createCommentLikeByCommentId.mockResolvedValue(like);
    service.deleteCommentLikeByLikeId.mockResolvedValue(like);
    service.getCommentLikesLengthByCommentId.mockResolvedValue([like]);

    await expect(controller.getCommentsByActivityId({ id: 'a1' }, '10')).resolves.toEqual({
      comments: [comment],
      allCommentsLength: 1,
    });
    await expect(controller.getCommentsLengthByActivityId({ id: 'a1' })).resolves.toBe(1);
    await expect(
      controller.postCommentWithActivityId({ comment: 'Hi', authorId: 'u1' }, { id: 'a1' }),
    ).resolves.toBeUndefined();
    await expect(controller.deleteCommentWithCommentId({ id: 'c1' })).resolves.toEqual(comment);
    await expect(controller.updateCommentById({ comment: 'Updated' }, { id: 'c1' })).resolves.toEqual(comment);
    await expect(controller.postCommentLikeWithCommentId({ commentId: 'c1', authorId: 'u1' })).resolves.toEqual(like);
    await expect(controller.deleteCommentLikeWithLikeId({ id: 'cl1' })).resolves.toEqual(like);
    await expect(controller.getCommentLikesLengthByCommentId({ id: 'c1' })).resolves.toEqual([like]);
  });

  it('propagates service errors from every comment endpoint', async () => {
    const error = new Error('service failed');
    Object.values(service).forEach((method) => method.mockRejectedValue(error));

    await expect(controller.getCommentsByActivityId({ id: 'a1' }, '10')).rejects.toBe(error);
    await expect(controller.getCommentsLengthByActivityId({ id: 'a1' })).rejects.toBe(error);
    await expect(controller.postCommentWithActivityId({ comment: 'Hi', authorId: 'u1' }, { id: 'a1' })).rejects.toBe(
      error,
    );
    await expect(controller.deleteCommentWithCommentId({ id: 'c1' })).rejects.toBe(error);
    await expect(controller.updateCommentById({ comment: 'Updated' }, { id: 'c1' })).rejects.toBe(error);
    await expect(controller.postCommentLikeWithCommentId({ commentId: 'c1', authorId: 'u1' })).rejects.toBe(error);
    await expect(controller.deleteCommentLikeWithLikeId({ id: 'cl1' })).rejects.toBe(error);
    await expect(controller.getCommentLikesLengthByCommentId({ id: 'c1' })).rejects.toBe(error);
  });

  it('rejects malformed comment pagination before calling the service', async () => {
    await expect(controller.getCommentsByActivityId({ id: 'a1' }, 'NaN')).rejects.toBeInstanceOf(BadRequestException);
    expect(service.getCommentsbyActivityId).not.toHaveBeenCalled();
  });
});
