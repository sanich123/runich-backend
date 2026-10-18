#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/4a7533f74a85a4a774efb21479e03e0250dea3876362f967dda107be66b5b0ae/contract';
import startContract from '../../snapshots/4a7533f74a85a4a774efb21479e03e0250dea3876362f967dda107be66b5b0ae/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/f1dd719c21846417bd900b7c525c82cdeacf8f4fae474136912a3cd1e66e2889/contract';
import endContract from '../../snapshots/f1dd719c21846417bd900b7c525c82cdeacf8f4fae474136912a3cd1e66e2889/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Activity',
        column: col('hide_map', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
