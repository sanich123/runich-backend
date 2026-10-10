#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/765f9930a005bb4fb0f192da6684cf662acdf93d5827f4839919e8e12acbbae9/contract';
import endContract from '../../snapshots/765f9930a005bb4fb0f192da6684cf662acdf93d5827f4839919e8e12acbbae9/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/3f27b1842a041d781fffc3bb6f7680f5c288c97ca72f097b51ff92247bbdbbca/contract';
import startContract from '../../snapshots/3f27b1842a041d781fffc3bb6f7680f5c288c97ca72f097b51ff92247bbdbbca/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Profile',
        column: col('hide_activity_statistics', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Profile',
        column: col('hide_following_list', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
