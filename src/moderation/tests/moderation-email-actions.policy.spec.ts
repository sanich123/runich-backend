import {
  getAvailableModerationEmailActions,
  getModerationEmailActionLabel,
  getModerationEmailTargetLabel,
} from '../moderation-email-actions.policy';

describe('moderation email action policy', () => {
  it('offers actions that match each target and its current status', () => {
    expect(getAvailableModerationEmailActions('media_upload', 'open', 'review_required')).toEqual([
      'approve_media',
      'reject_media',
    ]);
    expect(getAvailableModerationEmailActions('media_upload', 'open', 'approved')).toEqual([]);
    expect(getAvailableModerationEmailActions('user', 'in_review')).toEqual([
      'warn_user',
      'temporary_suspend',
      'permanent_suspend',
      'reject_report',
    ]);
    expect(getAvailableModerationEmailActions('comment', 'open', 'visible')).toEqual([
      'hide_content',
      'remove_content',
      'warn_user',
      'temporary_suspend',
      'permanent_suspend',
      'reject_report',
    ]);
    expect(getAvailableModerationEmailActions('comment', 'open', 'removed')).toEqual([
      'restore_content',
      'warn_user',
      'temporary_suspend',
      'permanent_suspend',
      'reject_report',
    ]);
    expect(getAvailableModerationEmailActions('comment', 'open', null)).toEqual([
      'remove_content',
      'warn_user',
      'temporary_suspend',
      'permanent_suspend',
      'reject_report',
    ]);
  });

  it('does not offer actions for reports that are no longer open', () => {
    expect(getAvailableModerationEmailActions('comment', 'resolved', 'visible')).toEqual([]);
    expect(getModerationEmailActionLabel('approve_media')).toBe('Одобрить фото или видео');
    expect(getModerationEmailTargetLabel('comment')).toBe('комментарий');
    expect(getModerationEmailTargetLabel('new_target')).toBe('new_target');
  });
});
