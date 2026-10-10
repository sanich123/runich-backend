#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/3f27b1842a041d781fffc3bb6f7680f5c288c97ca72f097b51ff92247bbdbbca/contract';
import endContract from '../../snapshots/3f27b1842a041d781fffc3bb6f7680f5c288c97ca72f097b51ff92247bbdbbca/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/c17207568d8f83a16ee5a53cfc9a6348c72cc1f68079541001da180215c738a3/contract';
import startContract from '../../snapshots/c17207568d8f83a16ee5a53cfc9a6348c72cc1f68079541001da180215c738a3/contract.json' with { type: 'json' };
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
