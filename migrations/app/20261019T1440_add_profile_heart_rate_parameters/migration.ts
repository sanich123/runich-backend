#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/1ae533fab6c31b41428b19a1d444d9f31204a0d6d673ea6811acf240ab0c8c49/contract';
import endContract from '../../snapshots/1ae533fab6c31b41428b19a1d444d9f31204a0d6d673ea6811acf240ab0c8c49/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/f3da64af7aa944be28d911fd6782c44e01570e6652cef52fd95219229c0b1699/contract';
import startContract from '../../snapshots/f3da64af7aa944be28d911fd6782c44e01570e6652cef52fd95219229c0b1699/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Profile',
        column: col('allow_activity_elevation_viewing', 'bool', {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Profile',
        column: col('allow_activity_pace_viewing', 'bool', {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Profile',
        column: col('max_heart_rate', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Profile',
        column: col('resting_heart_rate', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.setDefault({
        schema: 'public',
        table: 'Profile',
        column: col('allow_activity_heart_rate_viewing', 'bool', {
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
