#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/b5752d38489d5a558f86b045cff04e4e3bbfece01e26caf130496c7aedce3a63/contract';
import startContract from '../../snapshots/b5752d38489d5a558f86b045cff04e4e3bbfece01e26caf130496c7aedce3a63/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/c17207568d8f83a16ee5a53cfc9a6348c72cc1f68079541001da180215c738a3/contract';
import endContract from '../../snapshots/c17207568d8f83a16ee5a53cfc9a6348c72cc1f68079541001da180215c738a3/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
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
      this.addUnique({
        schema: 'public',
        table: 'Subscriptions',
        constraint: 'Subscriptions_provider_provider_subscription_id_key',
        columns: ['provider', 'provider_subscription_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Subscriptions',
        index: 'Subscriptions_user_id_status_expires_at_idx',
        columns: ['user_id', 'status', 'expires_at'],
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
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
