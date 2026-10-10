#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/e130df6dcaae6dccebf268e10917d93a513c760ae855745045641fabed7d56e2/contract';
import startContract from '../../snapshots/e130df6dcaae6dccebf268e10917d93a513c760ae855745045641fabed7d56e2/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/48eb2c819a167cb9966271530fbf40aa959d4716da09557359e3306d71954256/contract';
import endContract from '../../snapshots/48eb2c819a167cb9966271530fbf40aa959d4716da09557359e3306d71954256/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Profile',
        column: col('allow_likes_list_viewing', 'bool', {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
