#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/1fd9deb34bc84d13ebebad646073c5ec9977f74be403a029223007a787e01c04/contract';
import startContract from '../../snapshots/1fd9deb34bc84d13ebebad646073c5ec9977f74be403a029223007a787e01c04/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/7cbcc982fb9d3f3d4b35bb9777e12c69718f9a4ce209f2e292d44d36a5a73ee0/contract';
import endContract from '../../snapshots/7cbcc982fb9d3f3d4b35bb9777e12c69718f9a4ce209f2e292d44d36a5a73ee0/contract.json' with { type: 'json' };
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
        table: 'GroupEvent',
        columns: [
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('created_by_user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('description', 'character varying(2000)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 2000 } },
          }),
          col('group_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', {
            notNull: true,
            default: fn(sql`gen_random_uuid()`),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('location_name', 'character varying(160)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 160 } },
          }),
          col('starts_at', 'timestamptz(6)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('title', 'character varying(120)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 120 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'GroupPost',
        columns: [
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('created_by_user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('group_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', {
            notNull: true,
            default: fn(sql`gen_random_uuid()`),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('photo_asset_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('text', 'character varying(2000)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 2000 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'Group',
        column: col('category_tags', 'text[]', {
          notNull: true,
          default: lit([]),
          codecRef: { codecId: 'pg/text@1', many: true },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Group',
        column: col('photo_asset_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'GroupMember',
        column: col('feed_preference', 'text', {
          notNull: true,
          default: lit('all'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'GroupMember',
        column: col('notification_preference', 'text', {
          notNull: true,
          default: lit('all'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Group',
        constraint: 'Group_category_tags_elem_not_null_d1c10078',
        expression: sql`array_position("category_tags", NULL) IS NULL`,
      }),
      this.addUnique({
        schema: 'public',
        table: 'Group',
        constraint: 'Group_photo_asset_id_key',
        columns: ['photo_asset_id'],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'GroupMember',
        constraint: 'GroupMember_feed_preference_check_955f9ea8',
        expression: sql`"feed_preference" IN ('all', 'admins')`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'GroupMember',
        constraint: 'GroupMember_notification_preference_check_74ff9fdc',
        expression: sql`"notification_preference" IN ('all', 'announcements', 'off')`,
      }),
      this.addUnique({
        schema: 'public',
        table: 'GroupPost',
        constraint: 'GroupPost_photo_asset_id_key',
        columns: ['photo_asset_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GroupEvent',
        index: 'GroupEvent_created_by_user_id_idx_764eade2',
        columns: ['created_by_user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GroupEvent',
        index: 'GroupEvent_group_id_idx_704354b6',
        columns: ['group_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GroupEvent',
        index: 'GroupEvent_group_id_starts_at_idx',
        columns: ['group_id', 'starts_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GroupPost',
        index: 'GroupPost_created_by_user_id_idx_764eade2',
        columns: ['created_by_user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GroupPost',
        index: 'GroupPost_group_id_created_at_idx',
        columns: ['group_id', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GroupPost',
        index: 'GroupPost_group_id_idx_704354b6',
        columns: ['group_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Group',
        foreignKey: {
          name: 'Group_photo_asset_id_fkey',
          columns: ['photo_asset_id'],
          references: { schema: 'public', table: 'MediaModerationAsset', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'GroupEvent',
        foreignKey: {
          name: 'GroupEvent_group_id_fkey',
          columns: ['group_id'],
          references: { schema: 'public', table: 'Group', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'GroupEvent',
        foreignKey: {
          name: 'GroupEvent_created_by_user_id_fkey',
          columns: ['created_by_user_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'GroupPost',
        foreignKey: {
          name: 'GroupPost_group_id_fkey',
          columns: ['group_id'],
          references: { schema: 'public', table: 'Group', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'GroupPost',
        foreignKey: {
          name: 'GroupPost_created_by_user_id_fkey',
          columns: ['created_by_user_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'GroupPost',
        foreignKey: {
          name: 'GroupPost_photo_asset_id_fkey',
          columns: ['photo_asset_id'],
          references: { schema: 'public', table: 'MediaModerationAsset', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
