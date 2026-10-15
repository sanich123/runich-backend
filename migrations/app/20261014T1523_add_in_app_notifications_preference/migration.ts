#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/0f062aeb609373c9049602d71797ff34826431845413e93598e8139c9b042982/contract';
import startContract from '../../snapshots/0f062aeb609373c9049602d71797ff34826431845413e93598e8139c9b042982/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/70bf8897506a55da0d6b754cadbea52f7d3c07a48f29fcf6d452f83f3fca8bc5/contract';
import endContract from '../../snapshots/70bf8897506a55da0d6b754cadbea52f7d3c07a48f29fcf6d452f83f3fca8bc5/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Profile',
        column: col('in_app_notifications', 'bool', {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
