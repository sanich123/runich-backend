#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/3efb48b9264a2456ae47ae133573e8f8f132c2e9ec9de007412bf5cef2990a1c/contract';
import endContract from '../../snapshots/3efb48b9264a2456ae47ae133573e8f8f132c2e9ec9de007412bf5cef2990a1c/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'Activity',
        columns: [
          col('calories_active', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('date', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('distance', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('duration', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('elevationGain', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('emotion', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('kilometresSplit', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('location_enrichment_status', 'character varying(16)', {
            notNull: true,
            default: lit('queued'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 16 } },
          }),
          col('location_name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('mapPhotoUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('mapPhotoUrlBlurhash', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('media_processing_status', 'character varying(16)', {
            notNull: true,
            default: lit('queued'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 16 } },
          }),
          col('profileId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('route_checksum', 'character varying(64)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 64 } },
          }),
          col('route_format_version', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('route_point_count', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('route_size_bytes', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('route_storage_key', 'character varying(512)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 512 } },
          }),
          col('source', 'character varying(32)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 32 } },
          }),
          col('sourceActivityId', 'character varying(128)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 128 } },
          }),
          col('speed', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('sport', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('steps', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('time_zone', 'character varying(64)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 64 } },
          }),
          col('title', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(6)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('visibility', 'text', {
            notNull: true,
            default: lit('public'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('weather_code', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('weather_temperature', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('weather_wind_speed', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
        ],
        constraints: [
          primaryKey(['id'], { name: 'Activity_pkey' }),
          checkExpression(
            'Activity_visibility_check_3bfc61f5',
            `"visibility" IN ('public', 'followers', 'private')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'ActivityMedia',
        columns: [
          col('activity_date', 'timestamptz(6)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('activity_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('blurhash', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('position', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('thumbnail', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('url', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'], { name: 'ActivityMedia_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'ActivityMigrationJob',
        columns: [
          col('archivePath', 'character varying(2048)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 2048 } },
          }),
          col('createdAt', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('errorMessage', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('finishedAt', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('importedActivities', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('processedActivities', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('profileId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('skippedActivities', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('startedAt', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('status', 'character varying(32)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 32 } },
          }),
          col('totalActivities', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('upload_bytes_received', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('upload_bytes_total', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('upload_updated_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'], { name: 'ActivityMigrationJob_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'AuthExchange',
        columns: [
          col('code_hash', 'character varying(128)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 128 } },
          }),
          col('consumed_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('expires_at', 'timestamptz(6)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('purpose', 'character varying(32)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 32 } },
          }),
          col('user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'], { name: 'AuthExchange_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'Comment',
        columns: [
          col('activityId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('authorId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('comment', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('date', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('profileId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'], { name: 'Comment_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'CommentLike',
        columns: [
          col('authorId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('commentId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('date', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('profileId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'], { name: 'CommentLike_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'EmailNotificationJob',
        columns: [
          col('attempts', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('available_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('error_message', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('finished_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('notification_type', 'character varying(24)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 24 } },
          }),
          col('source_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('started_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('status', 'character varying(16)', {
            notNull: true,
            default: lit('queued'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 16 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Friend',
        columns: [
          col('createdAt', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('friendId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('profileId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('updatedAt', 'timestamptz(6)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'], { name: 'Friend_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'Like',
        columns: [
          col('activityId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('authorId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('date', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('profileId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'], { name: 'Like_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'LoadTestSeedJob',
        columns: [
          col('config', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('created_activities', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('created_comment_likes', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('created_comments', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('created_likes', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('error_message', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('finished_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('manifest_key', 'character varying(512)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 512 } },
          }),
          col('processed_activities', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('run_id', 'character varying(64)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 64 } },
          }),
          col('started_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('status', 'character varying(32)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 32 } },
          }),
          col('target_user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('total_activities', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('total_users', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [primaryKey(['id'], { name: 'LoadTestSeedJob_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'MediaCleanupJob',
        columns: [
          col('createdAt', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('errorMessage', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('finishedAt', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('startedAt', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('status', 'character varying(32)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 32 } },
          }),
          col('storage_key', 'character varying(512)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 512 } },
          }),
          col('user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'], { name: 'MediaCleanupJob_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'Profile',
        columns: [
          col('age', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('allow_activity_interactions', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('allow_activity_replay_viewing', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('allow_activity_sharing', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('allow_new_followers', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('bio', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('birthday', 'date', { codecRef: { codecId: 'pg/date-string@1' } }),
          col('city', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('email', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('emailNotifications', 'bool', {
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('gender', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('height', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('hide_activity_statistics', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('hide_following_list', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('hide_profile_photos', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('language', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('profilePhoto', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('profilePhotoBlurhash', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('profile_search_visible', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('sport', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('surname', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('weight', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'], { name: 'Profile_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'Subscriptions',
        columns: [
          col('cancel_at_period_end', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('expires_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('product_id', 'character varying(128)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 128 } },
          }),
          col('provider', 'character varying(32)', {
            notNull: true,
            default: lit('manual'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 32 } },
          }),
          col('provider_subscription_id', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('starts_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('status', 'character varying(24)', {
            notNull: true,
            default: lit('active'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 24 } },
          }),
          col('updated_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'], { name: 'Subscriptions_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'UserSession',
        columns: [
          col('app_build', 'character varying(32)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 32 } },
          }),
          col('app_version', 'character varying(32)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 32 } },
          }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('device_id', 'character varying(128)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 128 } },
          }),
          col('device_model', 'character varying(128)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 128 } },
          }),
          col('device_name', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('device_type', 'character varying(64)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 64 } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('ip_address', 'character varying(128)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 128 } },
          }),
          col('last_latitude', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('last_location_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('last_longitude', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('last_seen_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('manufacturer', 'character varying(128)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 128 } },
          }),
          col('os_name', 'character varying(64)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 64 } },
          }),
          col('os_version', 'character varying(64)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 64 } },
          }),
          col('platform', 'character varying(64)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 64 } },
          }),
          col('refresh_hash', 'character varying(128)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 128 } },
          }),
          col('revoked_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('user_agent', 'character varying(512)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 512 } },
          }),
          col('user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'], { name: 'UserSession_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'Users',
        columns: [
          col('aud', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('auth_provider', 'character varying(32)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 32 } },
          }),
          col('banned_until', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('confirmation_sent_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('confirmation_token', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('created_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('deleted_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('email', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('email_change', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('email_change_confirm_status', 'int2', {
            default: lit(0),
            codecRef: { codecId: 'pg/int2@1' },
          }),
          col('email_change_sent_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('email_change_token_current', 'character varying(255)', {
            default: lit(''),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('email_change_token_new', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('email_confirmed_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('encrypted_password', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('instance_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('invited_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('is_super_admin', 'bool', { codecRef: { codecId: 'pg/bool@1' } }),
          col('last_sign_in_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('phone', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('phone_change', 'text', { default: lit(''), codecRef: { codecId: 'pg/text@1' } }),
          col('phone_change_sent_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('phone_change_token', 'character varying(255)', {
            default: lit(''),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('phone_confirmed_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('raw_app_meta_data', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('raw_user_meta_data', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('reauthentication_sent_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('reauthentication_token', 'character varying(255)', {
            default: lit(''),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('recovery_sent_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('recovery_token', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('role', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('updated_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
        ],
        constraints: [primaryKey(['id'], { name: 'Users_pkey' })],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Activity',
        constraint: 'Activity_user_id_source_sourceActivityId_key',
        columns: ['user_id', 'source', 'sourceActivityId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'ActivityMedia',
        constraint: 'ActivityMedia_activity_id_position_key',
        columns: ['activity_id', 'position'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'AuthExchange',
        constraint: 'AuthExchange_code_hash_key',
        columns: ['code_hash'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'CommentLike',
        constraint: 'CommentLike_authorId_commentId_key',
        columns: ['authorId', 'commentId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'EmailNotificationJob',
        constraint: 'EmailNotificationJob_notification_type_source_id_key',
        columns: ['notification_type', 'source_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Friend',
        constraint: 'Friend_user_id_friendId_key',
        columns: ['user_id', 'friendId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Like',
        constraint: 'Like_authorId_activityId_key',
        columns: ['authorId', 'activityId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'LoadTestSeedJob',
        constraint: 'LoadTestSeedJob_runId_key',
        columns: ['run_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Profile',
        constraint: 'Profile_user_id_key',
        columns: ['user_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Subscriptions',
        constraint: 'Subscriptions_provider_provider_subscription_id_key',
        columns: ['provider', 'provider_subscription_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'UserSession',
        constraint: 'UserSession_refresh_hash_key',
        columns: ['refresh_hash'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Users',
        constraint: 'Users_email_key',
        columns: ['email'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Users',
        constraint: 'Users_phone_key',
        columns: ['phone'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Activity',
        index: 'Activity_user_id_date_id_idx',
        columns: ['user_id', 'date', 'id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Activity',
        index: 'Activity_user_id_visibility_date_id_idx',
        columns: ['user_id', 'visibility', 'date', 'id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Activity',
        index: 'Activity_visibility_date_id_idx',
        columns: ['visibility', 'date', 'id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ActivityMedia',
        index: 'ActivityMedia_activity_id_idx',
        columns: ['activity_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ActivityMedia',
        index: 'ActivityMedia_user_id_activity_date_idx',
        columns: ['user_id', 'activity_date', 'activity_id', 'position'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ActivityMigrationJob',
        index: 'ActivityMigrationJob_status_createdAt_idx',
        columns: ['status', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ActivityMigrationJob',
        index: 'ActivityMigrationJob_user_id_createdAt_idx',
        columns: ['user_id', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AuthExchange',
        index: 'AuthExchange_expires_at_idx',
        columns: ['expires_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AuthExchange',
        index: 'AuthExchange_user_id_purpose_idx',
        columns: ['user_id', 'purpose'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Comment',
        index: 'Comment_activityId_idx',
        columns: ['activityId', 'date', 'id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CommentLike',
        index: 'CommentLike_commentId_idx',
        columns: ['commentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'EmailNotificationJob',
        index: 'EmailNotificationJob_status_available_at_created_at_idx',
        columns: ['status', 'available_at', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Friend',
        index: 'Friend_friendId_idx',
        columns: ['friendId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Like',
        index: 'Like_activityId_idx',
        columns: ['activityId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'LoadTestSeedJob',
        index: 'LoadTestSeedJob_status_createdAt_idx',
        columns: ['status', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'MediaCleanupJob',
        index: 'MediaCleanupJob_status_createdAt_idx',
        columns: ['status', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'MediaCleanupJob',
        index: 'MediaCleanupJob_user_id_createdAt_idx',
        columns: ['user_id', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Profile',
        index: 'Profile_email_trgm_idx_4d9a0f8f',
        expression: 'email gin_trgm_ops',
        extras: { type: 'gin' },
      }),
      this.createIndex({
        schema: 'public',
        table: 'Profile',
        index: 'Profile_name_trgm_idx_0595b3e0',
        expression: 'name gin_trgm_ops',
        extras: { type: 'gin' },
      }),
      this.createIndex({
        schema: 'public',
        table: 'Profile',
        index: 'Profile_surname_trgm_idx_ad71ab59',
        expression: 'surname gin_trgm_ops',
        extras: { type: 'gin' },
      }),
      this.createIndex({
        schema: 'public',
        table: 'Subscriptions',
        index: 'Subscriptions_user_id_status_expires_at_idx',
        columns: ['user_id', 'status', 'expires_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'UserSession',
        index: 'UserSession_user_id_device_id_idx',
        columns: ['user_id', 'device_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'UserSession',
        index: 'UserSession_user_id_idx',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Users',
        index: 'Users_email_trgm_idx_4d9a0f8f',
        expression: 'email gin_trgm_ops',
        extras: { type: 'gin' },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Activity',
        foreignKey: {
          name: 'Activity_profileId_fkey',
          columns: ['profileId'],
          references: { schema: 'public', table: 'Profile', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Activity',
        foreignKey: {
          name: 'Activity_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ActivityMedia',
        foreignKey: {
          name: 'ActivityMedia_activity_id_fkey',
          columns: ['activity_id'],
          references: { schema: 'public', table: 'Activity', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ActivityMigrationJob',
        foreignKey: {
          name: 'ActivityMigrationJob_profileId_fkey',
          columns: ['profileId'],
          references: { schema: 'public', table: 'Profile', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ActivityMigrationJob',
        foreignKey: {
          name: 'ActivityMigrationJob_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'AuthExchange',
        foreignKey: {
          name: 'AuthExchange_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Comment',
        foreignKey: {
          name: 'Comment_activityId_fkey',
          columns: ['activityId'],
          references: { schema: 'public', table: 'Activity', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Comment',
        foreignKey: {
          name: 'Comment_profileId_fkey',
          columns: ['profileId'],
          references: { schema: 'public', table: 'Profile', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'CommentLike',
        foreignKey: {
          name: 'CommentLike_commentId_fkey',
          columns: ['commentId'],
          references: { schema: 'public', table: 'Comment', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'CommentLike',
        foreignKey: {
          name: 'CommentLike_profileId_fkey',
          columns: ['profileId'],
          references: { schema: 'public', table: 'Profile', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Friend',
        foreignKey: {
          name: 'Friend_profileId_fkey',
          columns: ['profileId'],
          references: { schema: 'public', table: 'Profile', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Friend',
        foreignKey: {
          name: 'Friend_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Like',
        foreignKey: {
          name: 'Like_activityId_fkey',
          columns: ['activityId'],
          references: { schema: 'public', table: 'Activity', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Like',
        foreignKey: {
          name: 'Like_profileId_fkey',
          columns: ['profileId'],
          references: { schema: 'public', table: 'Profile', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Profile',
        foreignKey: {
          name: 'Profile_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Subscriptions',
        foreignKey: {
          name: 'Subscriptions_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'UserSession',
        foreignKey: {
          name: 'UserSession_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
