#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/a6d0a5018be80f2d7c43d0dd8f0838ce0bff3dbd68c136ef7fa2d7c2b4b693bf/contract';
import endContract from '../../snapshots/a6d0a5018be80f2d7c43d0dd8f0838ce0bff3dbd68c136ef7fa2d7c2b4b693bf/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/dc04cb7e1d6a3db4146fdba07c6b6c32b1af4c991eac31f39ec9217288046fd6/contract';
import startContract from '../../snapshots/dc04cb7e1d6a3db4146fdba07c6b6c32b1af4c991eac31f39ec9217288046fd6/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'GroupEvent',
        column: col('distance_km', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'GroupEvent',
        column: col('sport', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Profile',
        column: col('group_events_notifications', 'bool', {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Profile',
        column: col('group_posts_notifications', 'bool', {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
