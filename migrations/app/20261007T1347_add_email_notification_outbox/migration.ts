#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/5f5bc69fb5839e7dfecf35e6593e6f7cae7ec222dd2e5ad1d83d5b73531280a1/contract';
import startContract from '../../snapshots/5f5bc69fb5839e7dfecf35e6593e6f7cae7ec222dd2e5ad1d83d5b73531280a1/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/efdab076dc839ea4bc9e5fef52b67e2efbb219fac552ea9f7a4a41dc6329457a/contract';
import endContract from '../../snapshots/efdab076dc839ea4bc9e5fef52b67e2efbb219fac552ea9f7a4a41dc6329457a/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
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
      this.addUnique({
        schema: 'public',
        table: 'EmailNotificationJob',
        constraint: 'EmailNotificationJob_notification_type_source_id_key',
        columns: ['notification_type', 'source_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'EmailNotificationJob',
        index: 'EmailNotificationJob_status_available_at_created_at_idx',
        columns: ['status', 'available_at', 'created_at'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
