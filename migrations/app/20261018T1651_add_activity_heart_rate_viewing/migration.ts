#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/f3da64af7aa944be28d911fd6782c44e01570e6652cef52fd95219229c0b1699/contract';
import endContract from '../../snapshots/f3da64af7aa944be28d911fd6782c44e01570e6652cef52fd95219229c0b1699/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/f451c32846d8846087e2d684a9433d7a4d158b03052219e1224078dc480b0753/contract';
import startContract from '../../snapshots/f451c32846d8846087e2d684a9433d7a4d158b03052219e1224078dc480b0753/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Profile',
        column: col('allow_activity_heart_rate_viewing', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
