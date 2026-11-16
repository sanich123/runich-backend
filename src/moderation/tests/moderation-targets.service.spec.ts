import { asyncMock } from 'src/tests/helpers';
import { ModerationTargetsService } from '../services/moderation-targets.service';

function createTransaction() {
  return {
    comment: { updateMany: asyncMock(), update: asyncMock() },
  };
}

describe('ModerationTargetsService', () => {
  const notifications = {
    notifyPublishedComment: asyncMock(),
    notifyPublishedGroupPost: asyncMock(),
  };
  const service = new ModerationTargetsService({} as never, notifications as never);

  beforeEach(() => {
    notifications.notifyPublishedComment.mockClear();
    notifications.notifyPublishedGroupPost.mockClear();
  });

  it.each([
    ['hide_content', 'hidden'],
    ['remove_content', 'removed'],
    ['approve_content', 'visible'],
  ] as const)('maps %s to the target moderation status', (action, status) => {
    expect(service.getContentStatus(action)).toBe(status);
  });

  it('sends one publication notification when a pending comment becomes visible', async () => {
    const transaction = createTransaction();
    transaction.comment.updateMany.mockResolvedValue({ count: 1 });

    await service.updateTargetModerationStatus(
      transaction as never,
      { targetType: 'comment', targetId: 'comment-1' },
      'visible',
    );

    expect(notifications.notifyPublishedComment).toHaveBeenCalledWith(transaction, 'comment-1');
    expect(transaction.comment.update).not.toHaveBeenCalled();
  });

  it('does not duplicate publication notification for an already visible comment', async () => {
    const transaction = createTransaction();
    transaction.comment.updateMany.mockResolvedValue({ count: 0 });

    await service.updateTargetModerationStatus(
      transaction as never,
      { targetType: 'comment', targetId: 'comment-1' },
      'visible',
    );

    expect(transaction.comment.update).toHaveBeenCalledWith({
      where: { id: 'comment-1' },
      data: { moderationStatus: 'visible', moderationProcessingStartedAt: null },
    });
    expect(notifications.notifyPublishedComment).not.toHaveBeenCalled();
  });

  it('updates a hidden comment without sending a publication notification', async () => {
    const transaction = createTransaction();

    await service.updateTargetModerationStatus(
      transaction as never,
      { targetType: 'comment', targetId: 'comment-1' },
      'hidden',
    );

    expect(transaction.comment.update).toHaveBeenCalledWith({
      where: { id: 'comment-1' },
      data: { moderationStatus: 'hidden', moderationProcessingStartedAt: null },
    });
    expect(transaction.comment.updateMany).not.toHaveBeenCalled();
    expect(notifications.notifyPublishedComment).not.toHaveBeenCalled();
  });
});
