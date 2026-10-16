#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/c35a1aa809596e62b1552e7ef1f5d90e6c96adef3b7aeff8b6b50e4932592625/contract';
import startContract from '../../snapshots/c35a1aa809596e62b1552e7ef1f5d90e6c96adef3b7aeff8b6b50e4932592625/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/c9efdd1f550ef1cde3ebb501c4bd10478338a49e1b832e99d6115b69f1ac4030/contract';
import endContract from '../../snapshots/c9efdd1f550ef1cde3ebb501c4bd10478338a49e1b832e99d6115b69f1ac4030/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Activity',
        column: col('is_favorite', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
