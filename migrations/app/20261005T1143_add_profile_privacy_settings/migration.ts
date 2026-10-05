#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/48dbf5e0f9261bce1d0a356733b7840ff9bcbc18823c32a8cd2d3c2290a75b6c/contract';
import endContract from '../../snapshots/48dbf5e0f9261bce1d0a356733b7840ff9bcbc18823c32a8cd2d3c2290a75b6c/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/611579864d15b6ed6e4b976ac5583b78e1f9835bad2124436d5c326d13a5309c/contract';
import startContract from '../../snapshots/611579864d15b6ed6e4b976ac5583b78e1f9835bad2124436d5c326d13a5309c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Profile',
        column: col('allow_activity_interactions', 'bool', {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Profile',
        column: col('profile_search_visible', 'bool', {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
