#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/44c10c863a055adadf058552789c26446bd95a2eedfbc2e549de8aab3eba38de/contract';
import endContract from '../../snapshots/44c10c863a055adadf058552789c26446bd95a2eedfbc2e549de8aab3eba38de/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/9c05c9cf3388a3cfafb5ccf943005001032b55ac56185123139120bec3365efc/contract';
import startContract from '../../snapshots/9c05c9cf3388a3cfafb5ccf943005001032b55ac56185123139120bec3365efc/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createIndex({
        schema: 'public',
        table: 'Activity',
        index: 'Activity_user_id_isPublic_date_id_idx',
        columns: ['user_id', 'isPublic', 'date', 'id'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
