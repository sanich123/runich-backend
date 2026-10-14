#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/70bf8897506a55da0d6b754cadbea52f7d3c07a48f29fcf6d452f83f3fca8bc5/contract';
import startContract from '../../snapshots/70bf8897506a55da0d6b754cadbea52f7d3c07a48f29fcf6d452f83f3fca8bc5/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/c35a1aa809596e62b1552e7ef1f5d90e6c96adef3b7aeff8b6b50e4932592625/contract';
import endContract from '../../snapshots/c35a1aa809596e62b1552e7ef1f5d90e6c96adef3b7aeff8b6b50e4932592625/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Notification',
        column: col('in_app', 'bool', {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Profile',
        column: col('push_notifications', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
