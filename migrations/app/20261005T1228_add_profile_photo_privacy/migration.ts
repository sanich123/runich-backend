#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/11ce5a57a57e1452dd87a30b4a46c8a33d4b7e779c7b7872b32d15aec1b12f8a/contract';
import startContract from '../../snapshots/11ce5a57a57e1452dd87a30b4a46c8a33d4b7e779c7b7872b32d15aec1b12f8a/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/9485b1c0d30333c9b67c513c525784c58a78a0517b65d8e15d12d73fd879fb24/contract';
import endContract from '../../snapshots/9485b1c0d30333c9b67c513c525784c58a78a0517b65d8e15d12d73fd879fb24/contract.json' with { type: 'json' };
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
