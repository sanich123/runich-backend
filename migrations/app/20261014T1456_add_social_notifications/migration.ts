#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/0f062aeb609373c9049602d71797ff34826431845413e93598e8139c9b042982/contract';
import endContract from '../../snapshots/0f062aeb609373c9049602d71797ff34826431845413e93598e8139c9b042982/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/3efb48b9264a2456ae47ae133573e8f8f132c2e9ec9de007412bf5cef2990a1c/contract';
import startContract from '../../snapshots/3efb48b9264a2456ae47ae133573e8f8f132c2e9ec9de007412bf5cef2990a1c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'Notification',
        columns: [
          col('actor_name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('actor_profile_photo', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('actor_surname', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('actor_user_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('content', 'text', { codecRef: { codecId: 'pg/text@1' } }),
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
          col('read_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('recipient_user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('related_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('source_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('target_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('target_type', 'character varying(32)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 32 } },
          }),
          col('type', 'character varying(64)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 64 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'PushDeviceToken',
        columns: [
          col('active', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
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
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('platform', 'character varying(32)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 32 } },
          }),
          col('token', 'character varying(512)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 512 } },
          }),
          col('updated_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'PushNotificationJob',
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
          col('notification_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
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
      this.addUnique({
        schema: 'public',
        table: 'Notification',
        constraint: 'Notification_recipient_type_source_key',
        columns: ['recipient_user_id', 'type', 'source_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'PushDeviceToken',
        constraint: 'PushDeviceToken_device_id_key',
        columns: ['device_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'PushDeviceToken',
        constraint: 'PushDeviceToken_token_key',
        columns: ['token'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'PushNotificationJob',
        constraint: 'PushNotificationJob_notification_id_key',
        columns: ['notification_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Notification',
        index: 'Notification_actor_user_id_idx_c46ca325',
        columns: ['actor_user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Notification',
        index: 'Notification_recipient_createdAt_id_idx',
        columns: ['recipient_user_id', 'created_at', 'id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Notification',
        index: 'Notification_recipient_readAt_idx',
        columns: ['recipient_user_id', 'read_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Notification',
        index: 'Notification_recipient_user_id_idx_86720e87',
        columns: ['recipient_user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PushDeviceToken',
        index: 'PushDeviceToken_user_active_idx',
        columns: ['user_id', 'active'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PushDeviceToken',
        index: 'PushDeviceToken_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PushNotificationJob',
        index: 'PushNotificationJob_status_available_at_created_at_idx',
        columns: ['status', 'available_at', 'created_at'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Notification',
        foreignKey: {
          name: 'Notification_recipient_user_id_fkey',
          columns: ['recipient_user_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Notification',
        foreignKey: {
          name: 'Notification_actor_user_id_fkey',
          columns: ['actor_user_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PushDeviceToken',
        foreignKey: {
          name: 'PushDeviceToken_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PushNotificationJob',
        foreignKey: {
          name: 'PushNotificationJob_notification_id_fkey',
          columns: ['notification_id'],
          references: { schema: 'public', table: 'Notification', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
