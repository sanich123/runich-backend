#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/9c05c9cf3388a3cfafb5ccf943005001032b55ac56185123139120bec3365efc/contract';
import endContract from '../../snapshots/9c05c9cf3388a3cfafb5ccf943005001032b55ac56185123139120bec3365efc/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/cb44b5854e2c120b5e26bfd3cc97f6f42c0d8e6ba7936af78c5c69523564e67a/contract';
import startContract from '../../snapshots/cb44b5854e2c120b5e26bfd3cc97f6f42c0d8e6ba7936af78c5c69523564e67a/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createIndex({
        schema: 'public',
        table: 'Activity',
        index: 'Activity_isPublic_date_id_idx',
        columns: ['isPublic', 'date', 'id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Activity',
        index: 'Activity_user_id_date_id_idx',
        columns: ['user_id', 'date', 'id'],
      }),
      this.dropIndex({
        schema: 'public',
        table: 'Comment',
        index: 'Comment_activityId_idx',
      }),
      this.createIndex({
        schema: 'public',
        table: 'Comment',
        index: 'Comment_activityId_idx',
        columns: ['activityId', 'date', 'id'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
