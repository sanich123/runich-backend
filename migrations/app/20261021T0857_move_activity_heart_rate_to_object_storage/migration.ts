#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/1ae533fab6c31b41428b19a1d444d9f31204a0d6d673ea6811acf240ab0c8c49/contract';
import startContract from '../../snapshots/1ae533fab6c31b41428b19a1d444d9f31204a0d6d673ea6811acf240ab0c8c49/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/4ee189d7e1e557c5a9fb68821ede039f46731647eb29a9197c629e4757538f2c/contract';
import endContract from '../../snapshots/4ee189d7e1e557c5a9fb68821ede039f46731647eb29a9197c629e4757538f2c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropColumn({ schema: 'public', table: 'Activity', column: 'heart_rate_samples' }),
      this.addColumn({
        schema: 'public',
        table: 'Activity',
        column: col('heart_rate_storage_key', 'character varying(512)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 512 } },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
