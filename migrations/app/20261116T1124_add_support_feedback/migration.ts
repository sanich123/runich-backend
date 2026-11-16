#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/4ca174a4e9755d2980eaf6c7ad810e7a78f5ac98dbf442243ff07ba7faa7c49e/contract';
import endContract from '../../snapshots/4ca174a4e9755d2980eaf6c7ad810e7a78f5ac98dbf442243ff07ba7faa7c49e/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/b3ec3b8f7f02095e0fb6999f37255c8e096d93be799f93e7bbfe764ce6ad437e/contract';
import startContract from '../../snapshots/b3ec3b8f7f02095e0fb6999f37255c8e096d93be799f93e7bbfe764ce6ad437e/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
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
        table: 'FeedbackReply',
        columns: [
          col('admin_email', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('admin_user_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('delivery_status', 'character varying(32)', {
            notNull: true,
            default: lit('pending'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 32 } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn(sql`gen_random_uuid()`),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('request_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('text', 'character varying(10000)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 10000 } },
          }),
        ],
        constraints: [primaryKey(['id'], { name: 'FeedbackReply_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'FeedbackRequest',
        columns: [
          col('admin_notification_sent', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('attachments', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('confirmation_email_sent', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('device_info', 'character varying(2000)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 2000 } },
          }),
          col('email', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn(sql`gen_random_uuid()`),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('kind', 'character varying(32)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 32 } },
          }),
          col('sender_user_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('status', 'character varying(32)', {
            notNull: true,
            default: lit('open'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 32 } },
          }),
          col('text', 'character varying(10000)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 10000 } },
          }),
          col('topic', 'character varying(32)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 32 } },
          }),
          col('updated_at', 'timestamptz(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
        ],
        constraints: [primaryKey(['id'], { name: 'FeedbackRequest_pkey' })],
      }),
      this.createIndex({
        schema: 'public',
        table: 'FeedbackReply',
        index: 'FeedbackReply_admin_user_id_idx_b23cda86',
        columns: ['admin_user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'FeedbackReply',
        index: 'FeedbackReply_request_id_created_at_idx',
        columns: ['request_id', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'FeedbackReply',
        index: 'FeedbackReply_request_id_idx_0aa129e0',
        columns: ['request_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'FeedbackRequest',
        index: 'FeedbackRequest_email_created_at_idx',
        columns: ['email', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'FeedbackRequest',
        index: 'FeedbackRequest_sender_user_id_idx_c381833a',
        columns: ['sender_user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'FeedbackRequest',
        index: 'FeedbackRequest_status_created_at_idx',
        columns: ['status', 'created_at'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'FeedbackReply',
        foreignKey: {
          name: 'FeedbackReply_request_id_fkey',
          columns: ['request_id'],
          references: { schema: 'public', table: 'FeedbackRequest', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'FeedbackReply',
        foreignKey: {
          name: 'FeedbackReply_admin_user_id_fkey',
          columns: ['admin_user_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'FeedbackRequest',
        foreignKey: {
          name: 'FeedbackRequest_sender_user_id_fkey',
          columns: ['sender_user_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
