#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/fb29c247b55a130f8849ece74a8a4917ce99ac86c914af01c60828bd3be02ef7/contract';
import endContract from '../../snapshots/fb29c247b55a130f8849ece74a8a4917ce99ac86c914af01c60828bd3be02ef7/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/48eb2c819a167cb9966271530fbf40aa959d4716da09557359e3306d71954256/contract';
import startContract from '../../snapshots/48eb2c819a167cb9966271530fbf40aa959d4716da09557359e3306d71954256/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Profile',
        column: col('allow_activity_sharing', 'bool', {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
