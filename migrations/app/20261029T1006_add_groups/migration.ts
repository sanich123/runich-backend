#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/1fd9deb34bc84d13ebebad646073c5ec9977f74be403a029223007a787e01c04/contract';
import endContract from '../../snapshots/1fd9deb34bc84d13ebebad646073c5ec9977f74be403a029223007a787e01c04/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/259f8d1ae7b33173f81399515933481f656ffee90e4976acc7b303e0c47e62c5/contract';
import startContract from '../../snapshots/259f8d1ae7b33173f81399515933481f656ffee90e4976acc7b303e0c47e62c5/contract.json' with { type: 'json' };
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
        table: 'Group',
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
          col('id', 'uuid', {
            notNull: true,
            default: fn(sql`gen_random_uuid()`),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('location_name', 'character varying(160)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 160 } },
          }),
          col('name', 'character varying(80)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 80 } },
          }),
          col('privacy', 'text', {
            notNull: true,
            default: lit('open'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('sports', 'text[]', {
            notNull: true,
            default: lit([]),
            codecRef: { codecId: 'pg/text@1', many: true },
          }),
          col('updated_at', 'timestamptz(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
        ],
        constraints: [
          primaryKey(['id'], { name: 'Group_pkey' }),
          checkExpression('Group_privacy_check_76d46d47', sql`"privacy" IN ('open', 'closed')`),
          checkExpression(
            'Group_sports_elem_not_null_fae29714',
            sql`array_position("sports", NULL) IS NULL`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'GroupMember',
        columns: [
          col('group_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', {
            notNull: true,
            default: fn(sql`gen_random_uuid()`),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('joined_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('requested_at', 'timestamptz(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('role', 'text', {
            notNull: true,
            default: lit('member'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('active'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id'], { name: 'GroupMember_pkey' }),
          checkExpression(
            'GroupMember_role_check_7f9f6ca4',
            sql`"role" IN ('owner', 'admin', 'member')`,
          ),
          checkExpression(
            'GroupMember_status_check_d20bf5cf',
            sql`"status" IN ('active', 'pending', 'rejected')`,
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'GroupMember',
        constraint: 'GroupMember_group_id_user_id_key',
        columns: ['group_id', 'user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Group',
        index: 'Group_created_by_user_id_idx',
        columns: ['created_by_user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Group',
        index: 'Group_privacy_created_at_idx',
        columns: ['privacy', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GroupMember',
        index: 'GroupMember_group_id_status_requested_at_idx',
        columns: ['group_id', 'status', 'requested_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GroupMember',
        index: 'GroupMember_user_id_status_group_id_idx',
        columns: ['user_id', 'status', 'group_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Group',
        foreignKey: {
          name: 'Group_created_by_user_id_fkey',
          columns: ['created_by_user_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'GroupMember',
        foreignKey: {
          name: 'GroupMember_group_id_fkey',
          columns: ['group_id'],
          references: { schema: 'public', table: 'Group', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'GroupMember',
        foreignKey: {
          name: 'GroupMember_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
