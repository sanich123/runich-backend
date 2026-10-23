#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/32bf1c2fb08dbc31f537920a31bc6cb67cc94a2fe55a09c4069bb2747797dfcf/contract';
import endContract from '../../snapshots/32bf1c2fb08dbc31f537920a31bc6cb67cc94a2fe55a09c4069bb2747797dfcf/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/4ee189d7e1e557c5a9fb68821ede039f46731647eb29a9197c629e4757538f2c/contract';
import startContract from '../../snapshots/4ee189d7e1e557c5a9fb68821ede039f46731647eb29a9197c629e4757538f2c/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'ContentReport',
        columns: [
          col('activity_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('assigned_moderator_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('comment_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('details', 'character varying(1000)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 1000 } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn(sql`gen_random_uuid()`),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('media_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('media_upload_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('priority', 'text', {
            notNull: true,
            default: lit('normal'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('reason', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reporter_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('reviewed_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('open'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('subject_user_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('target_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('target_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('target_user_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'ContentReport_priority_check_f8340615',
            sql`"priority" IN ('low', 'normal', 'high', 'urgent')`,
          ),
          checkExpression(
            'ContentReport_reason_check_65edaa13',
            sql`"reason" IN ('threats', 'harassment', 'hate_speech', 'sexual_content', 'violence', 'spam', 'other')`,
          ),
          checkExpression(
            'ContentReport_status_check_821e53f0',
            sql`"status" IN ('open', 'in_review', 'resolved', 'rejected', 'appealed')`,
          ),
          checkExpression(
            'ContentReport_target_type_check_15fa25b2',
            sql`"target_type" IN ('activity', 'comment', 'media', 'media_upload', 'user')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'MediaModerationAsset',
        columns: [
          col('attempts', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('byte_size', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('content_type', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('frame_count', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'uuid', {
            notNull: true,
            default: fn(sql`gen_random_uuid()`),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('media_id', 'character varying(100)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('model_version', 'character varying(100)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('owner_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('processing_started_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('published_key', 'character varying(2048)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 2048 } },
          }),
          col('quarantine_key', 'character varying(2048)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 2048 } },
          }),
          col('review_note', 'character varying(1000)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 1000 } },
          }),
          col('reviewed_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('reviewer_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('role', 'character varying(16)', {
            notNull: true,
            default: lit('media'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 16 } },
          }),
          col('scanned_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('scope', 'character varying(16)', {
            notNull: true,
            default: lit('activity'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 16 } },
          }),
          col('scores', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('queued'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'MediaModerationAsset_status_check_da540f42',
            sql`"status" IN ('queued', 'processing', 'review_required', 'approved', 'rejected', 'failed')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'ModerationAction',
        columns: [
          col('action', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('actor_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn(sql`gen_random_uuid()`),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('note', 'character varying(1000)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 1000 } },
          }),
          col('report_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'ModerationAction_action_check_f8fd69ad',
            sql`"action" IN ('hide_content', 'remove_content', 'restore_content', 'warn_user', 'temporary_suspend', 'permanent_suspend', 'reject_report', 'appeal_submitted', 'appeal_upheld', 'appeal_rejected', 'approve_media', 'reject_media')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'ModerationAppeal',
        columns: [
          col('appellant_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn(sql`gen_random_uuid()`),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('reason', 'character varying(1000)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 1000 } },
          }),
          col('report_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('resolution_note', 'character varying(1000)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 1000 } },
          }),
          col('reviewed_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('reviewer_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('pending'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'ModerationAppeal_status_check_f33e7560',
            sql`"status" IN ('pending', 'upheld', 'rejected')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'UserBlock',
        columns: [
          col('blocked_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('blocker_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn(sql`gen_random_uuid()`),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'Activity',
        column: col('moderation_status', 'text', {
          notNull: true,
          default: lit('visible'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ActivityMedia',
        column: col('media_moderation_asset_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ActivityMedia',
        column: col('media_review_status', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ActivityMedia',
        column: col('moderation_status', 'text', {
          notNull: true,
          default: lit('visible'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ActivityMedia',
        column: col('thumbnail_moderation_asset_id', 'uuid', {
          codecRef: { codecId: 'pg/uuid@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Comment',
        column: col('moderation_status', 'text', {
          notNull: true,
          default: lit('visible'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.dropNotNull({ schema: 'public', table: 'ActivityMedia', column: 'url' }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Activity',
        constraint: 'Activity_moderation_status_check_9e17caab',
        expression: sql`"moderation_status" IN ('visible', 'hidden', 'removed')`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'ActivityMedia',
        constraint: 'ActivityMedia_media_review_status_check_5a4c7db5',
        expression: sql`"media_review_status" IN ('queued', 'processing', 'review_required', 'approved', 'rejected', 'failed')`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'ActivityMedia',
        constraint: 'ActivityMedia_moderation_status_check_9e17caab',
        expression: sql`"moderation_status" IN ('visible', 'hidden', 'removed')`,
      }),
      this.addUnique({
        schema: 'public',
        table: 'ActivityMedia',
        constraint: 'ActivityMedia_media_moderation_asset_id_key',
        columns: ['media_moderation_asset_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'ActivityMedia',
        constraint: 'ActivityMedia_thumbnail_moderation_asset_id_key',
        columns: ['thumbnail_moderation_asset_id'],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Comment',
        constraint: 'Comment_moderation_status_check_9e17caab',
        expression: sql`"moderation_status" IN ('visible', 'hidden', 'removed')`,
      }),
      this.addUnique({
        schema: 'public',
        table: 'MediaModerationAsset',
        constraint: 'MediaModerationAsset_owner_media_role_key',
        columns: ['owner_id', 'media_id', 'role'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'UserBlock',
        constraint: 'UserBlock_blocker_blocked_key',
        columns: ['blocker_id', 'blocked_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ContentReport',
        index: 'ContentReport_activity_id_idx_c0c84520',
        columns: ['activity_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ContentReport',
        index: 'ContentReport_assigned_moderator_id_idx_357b4693',
        columns: ['assigned_moderator_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ContentReport',
        index: 'ContentReport_assignee_status_createdAt_idx',
        columns: ['assigned_moderator_id', 'status', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ContentReport',
        index: 'ContentReport_comment_id_idx_fe121171',
        columns: ['comment_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ContentReport',
        index: 'ContentReport_media_id_idx_495ca900',
        columns: ['media_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ContentReport',
        index: 'ContentReport_media_upload_id_idx',
        columns: ['media_upload_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ContentReport',
        index: 'ContentReport_reporter_createdAt_idx',
        columns: ['reporter_id', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ContentReport',
        index: 'ContentReport_reporter_id_idx_3eeed9a0',
        columns: ['reporter_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ContentReport',
        index: 'ContentReport_status_priority_createdAt_idx',
        columns: ['status', 'priority', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ContentReport',
        index: 'ContentReport_subject_createdAt_idx',
        columns: ['subject_user_id', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ContentReport',
        index: 'ContentReport_subject_user_id_idx_70bcca8f',
        columns: ['subject_user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ContentReport',
        index: 'ContentReport_target_idx',
        columns: ['target_type', 'target_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ContentReport',
        index: 'ContentReport_target_user_id_idx_cc615011',
        columns: ['target_user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'MediaModerationAsset',
        index: 'MediaModerationAsset_owner_created_at_idx',
        columns: ['owner_id', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'MediaModerationAsset',
        index: 'MediaModerationAsset_owner_id_idx_ade9f347',
        columns: ['owner_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'MediaModerationAsset',
        index: 'MediaModerationAsset_reviewer_id_idx_ab069db0',
        columns: ['reviewer_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'MediaModerationAsset',
        index: 'MediaModerationAsset_status_created_at_idx',
        columns: ['status', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ModerationAction',
        index: 'ModerationAction_actor_createdAt_idx',
        columns: ['actor_id', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ModerationAction',
        index: 'ModerationAction_actor_id_idx_69a2164d',
        columns: ['actor_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ModerationAction',
        index: 'ModerationAction_report_createdAt_idx',
        columns: ['report_id', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ModerationAction',
        index: 'ModerationAction_report_id_idx_6f6640fd',
        columns: ['report_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ModerationAppeal',
        index: 'ModerationAppeal_appellant_id_idx_ed1ef576',
        columns: ['appellant_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ModerationAppeal',
        index: 'ModerationAppeal_report_createdAt_idx',
        columns: ['report_id', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ModerationAppeal',
        index: 'ModerationAppeal_report_id_idx_6f6640fd',
        columns: ['report_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ModerationAppeal',
        index: 'ModerationAppeal_reviewer_id_idx_ab069db0',
        columns: ['reviewer_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ModerationAppeal',
        index: 'ModerationAppeal_status_createdAt_idx',
        columns: ['status', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'UserBlock',
        index: 'UserBlock_blocked_blocker_idx',
        columns: ['blocked_id', 'blocker_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'UserBlock',
        index: 'UserBlock_blocked_id_idx_181c3a00',
        columns: ['blocked_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'UserBlock',
        index: 'UserBlock_blocker_id_idx_e9326670',
        columns: ['blocker_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ContentReport',
        foreignKey: {
          name: 'ContentReport_reporter_id_fkey',
          columns: ['reporter_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ContentReport',
        foreignKey: {
          name: 'ContentReport_subject_user_id_fkey',
          columns: ['subject_user_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ContentReport',
        foreignKey: {
          name: 'ContentReport_assigned_moderator_id_fkey',
          columns: ['assigned_moderator_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ContentReport',
        foreignKey: {
          name: 'ContentReport_target_user_id_fkey',
          columns: ['target_user_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ContentReport',
        foreignKey: {
          name: 'ContentReport_activity_id_fkey',
          columns: ['activity_id'],
          references: { schema: 'public', table: 'Activity', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ContentReport',
        foreignKey: {
          name: 'ContentReport_comment_id_fkey',
          columns: ['comment_id'],
          references: { schema: 'public', table: 'Comment', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ContentReport',
        foreignKey: {
          name: 'ContentReport_media_id_fkey',
          columns: ['media_id'],
          references: { schema: 'public', table: 'ActivityMedia', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ContentReport',
        foreignKey: {
          name: 'ContentReport_media_upload_id_fkey',
          columns: ['media_upload_id'],
          references: { schema: 'public', table: 'MediaModerationAsset', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'MediaModerationAsset',
        foreignKey: {
          name: 'MediaModerationAsset_owner_id_fkey',
          columns: ['owner_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'MediaModerationAsset',
        foreignKey: {
          name: 'MediaModerationAsset_reviewer_id_fkey',
          columns: ['reviewer_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ActivityMedia',
        foreignKey: {
          name: 'ActivityMedia_media_moderation_asset_id_fkey',
          columns: ['media_moderation_asset_id'],
          references: { schema: 'public', table: 'MediaModerationAsset', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ActivityMedia',
        foreignKey: {
          name: 'ActivityMedia_thumbnail_moderation_asset_id_fkey',
          columns: ['thumbnail_moderation_asset_id'],
          references: { schema: 'public', table: 'MediaModerationAsset', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ModerationAction',
        foreignKey: {
          name: 'ModerationAction_report_id_fkey',
          columns: ['report_id'],
          references: { schema: 'public', table: 'ContentReport', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ModerationAction',
        foreignKey: {
          name: 'ModerationAction_actor_id_fkey',
          columns: ['actor_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ModerationAppeal',
        foreignKey: {
          name: 'ModerationAppeal_report_id_fkey',
          columns: ['report_id'],
          references: { schema: 'public', table: 'ContentReport', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ModerationAppeal',
        foreignKey: {
          name: 'ModerationAppeal_appellant_id_fkey',
          columns: ['appellant_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ModerationAppeal',
        foreignKey: {
          name: 'ModerationAppeal_reviewer_id_fkey',
          columns: ['reviewer_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'UserBlock',
        foreignKey: {
          name: 'UserBlock_blocker_id_fkey',
          columns: ['blocker_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'UserBlock',
        foreignKey: {
          name: 'UserBlock_blocked_id_fkey',
          columns: ['blocked_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
