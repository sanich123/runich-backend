#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/765f9930a005bb4fb0f192da6684cf662acdf93d5827f4839919e8e12acbbae9/contract';
import startContract from '../../snapshots/765f9930a005bb4fb0f192da6684cf662acdf93d5827f4839919e8e12acbbae9/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e130df6dcaae6dccebf268e10917d93a513c760ae855745045641fabed7d56e2/contract';
import endContract from '../../snapshots/e130df6dcaae6dccebf268e10917d93a513c760ae855745045641fabed7d56e2/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Profile',
        column: col('hide_profile_photos', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
