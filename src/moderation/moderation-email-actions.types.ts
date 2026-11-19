import type { ModerationActionType } from './shared/moderation.types';

export type ModerationEmailAction = Extract<
  ModerationActionType,
  | 'hide_content'
  | 'remove_content'
  | 'restore_content'
  | 'warn_user'
  | 'temporary_suspend'
  | 'permanent_suspend'
  | 'reject_report'
  | 'approve_media'
  | 'reject_media'
>;

export interface ModerationEmailActionToken {
  reportId: string;
  action: ModerationEmailAction;
  expiresAt: number;
}
