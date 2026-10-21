#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/4a7533f74a85a4a774efb21479e03e0250dea3876362f967dda107be66b5b0ae/contract';
import endContract from '../../snapshots/4a7533f74a85a4a774efb21479e03e0250dea3876362f967dda107be66b5b0ae/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/c9efdd1f550ef1cde3ebb501c4bd10478338a49e1b832e99d6115b69f1ac4030/contract';
import startContract from '../../snapshots/c9efdd1f550ef1cde3ebb501c4bd10478338a49e1b832e99d6115b69f1ac4030/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Activity',
        column: col('average_heart_rate', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Activity',
        column: col('heart_rate_samples', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Activity',
        column: col('max_heart_rate', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Activity',
        column: col('min_heart_rate', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
