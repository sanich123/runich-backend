#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/11ce5a57a57e1452dd87a30b4a46c8a33d4b7e779c7b7872b32d15aec1b12f8a/contract';
import endContract from '../../snapshots/11ce5a57a57e1452dd87a30b4a46c8a33d4b7e779c7b7872b32d15aec1b12f8a/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/48dbf5e0f9261bce1d0a356733b7840ff9bcbc18823c32a8cd2d3c2290a75b6c/contract';
import startContract from '../../snapshots/48dbf5e0f9261bce1d0a356733b7840ff9bcbc18823c32a8cd2d3c2290a75b6c/contract.json' with { type: 'json' };
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
