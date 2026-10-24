#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/32bf1c2fb08dbc31f537920a31bc6cb67cc94a2fe55a09c4069bb2747797dfcf/contract';
import startContract from '../../snapshots/32bf1c2fb08dbc31f537920a31bc6cb67cc94a2fe55a09c4069bb2747797dfcf/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/ee87d74127e76bc9e86c47ee60feabc170f0e913cc0ac7892337f26bb162c69d/contract';
import endContract from '../../snapshots/ee87d74127e76bc9e86c47ee60feabc170f0e913cc0ac7892337f26bb162c69d/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  col,
  fn,
  lit,
  primaryKey,
  rawSql,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'AdminAccessAudit',
        columns: [
          col('action', 'character varying(16)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 16 } },
          }),
          col('actor_email', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('actor_user_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
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
          col('role', 'character varying(32)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 32 } },
          }),
          col('target_email', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('target_user_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'], { name: 'AdminAccessAudit_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'AdminRoleAssignments',
        columns: [
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('granted_by_user_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', {
            notNull: true,
            default: fn(sql`gen_random_uuid()`),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('is_active', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('role', 'character varying(32)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 32 } },
          }),
          col('updated_at', 'timestamptz(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'], { name: 'AdminRoleAssignments_pkey' })],
      }),
      this.addUnique({
        schema: 'public',
        table: 'AdminRoleAssignments',
        constraint: 'AdminRoleAssignments_user_id_role_key',
        columns: ['user_id', 'role'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AdminAccessAudit',
        index: 'AdminAccessAudit_actor_user_id_idx_c46ca325',
        columns: ['actor_user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AdminAccessAudit',
        index: 'AdminAccessAudit_created_at_idx',
        columns: ['created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AdminAccessAudit',
        index: 'AdminAccessAudit_target_user_id_idx_cc615011',
        columns: ['target_user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AdminRoleAssignments',
        index: 'AdminRoleAssignments_granted_by_user_id_idx_d055b00f',
        columns: ['granted_by_user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AdminRoleAssignments',
        index: 'AdminRoleAssignments_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AdminRoleAssignments',
        index: 'AdminRoleAssignments_user_id_is_active_idx',
        columns: ['user_id', 'is_active'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'AdminAccessAudit',
        foreignKey: {
          name: 'AdminAccessAudit_actor_user_id_fkey',
          columns: ['actor_user_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'AdminAccessAudit',
        foreignKey: {
          name: 'AdminAccessAudit_target_user_id_fkey',
          columns: ['target_user_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'AdminRoleAssignments',
        foreignKey: {
          name: 'AdminRoleAssignments_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'AdminRoleAssignments',
        foreignKey: {
          name: 'AdminRoleAssignments_granted_by_user_id_fkey',
          columns: ['granted_by_user_id'],
          references: { schema: 'public', table: 'Users', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      rawSql({
        id: 'data.initial-admin-superusers',
        label: 'Grant initial admin superuser access',
        operationClass: 'data',
        target: {
          id: 'postgres',
          details: { schema: 'public', objectType: 'table', name: 'Users' },
        },
        precheck: [],
        execute: [
          {
            description: 'set the initial admin users as superusers',
            sql: `UPDATE "public"."Users"
SET "is_super_admin" = true
WHERE lower("email") IN ('runich.app@yandex.ru', 'varon-in@yandex.ru', 'aovoronin.piano@gmail.com')`,
          },
        ],
        postcheck: [
          {
            description: 'verify existing configured admins are superusers and at least one active superuser exists',
            sql: `SELECT EXISTS (
  SELECT 1
  FROM "public"."Users"
  WHERE "is_super_admin" IS TRUE
    AND "email_confirmed_at" IS NOT NULL
    AND "deleted_at" IS NULL
) AND NOT EXISTS (
  SELECT 1
  FROM "public"."Users"
  WHERE lower("email") IN ('runich.app@yandex.ru', 'varon-in@yandex.ru', 'aovoronin.piano@gmail.com')
    AND "is_super_admin" IS DISTINCT FROM true
) AS "result"`,
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
