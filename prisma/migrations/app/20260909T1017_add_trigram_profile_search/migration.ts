#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/1b3187968c7d81a0ca8577d40a63b9c9c305fd84f20c6be29bc8d712a72e78ea/contract';
import endContract from '../../snapshots/1b3187968c7d81a0ca8577d40a63b9c9c305fd84f20c6be29bc8d712a72e78ea/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/44c10c863a055adadf058552789c26446bd95a2eedfbc2e549de8aab3eba38de/contract';
import startContract from '../../snapshots/44c10c863a055adadf058552789c26446bd95a2eedfbc2e549de8aab3eba38de/contract.json' with { type: 'json' };
import { createExtension, Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      createExtension('pg_trgm'),
      this.createIndex({
        schema: 'public',
        table: 'Profile',
        index: 'Profile_email_trgm_idx',
        expression: 'email gin_trgm_ops',
        extras: { type: 'gin' },
      }),
      this.createIndex({
        schema: 'public',
        table: 'Profile',
        index: 'Profile_name_trgm_idx',
        expression: 'name gin_trgm_ops',
        extras: { type: 'gin' },
      }),
      this.createIndex({
        schema: 'public',
        table: 'Profile',
        index: 'Profile_surname_trgm_idx',
        expression: 'surname gin_trgm_ops',
        extras: { type: 'gin' },
      }),
      this.createIndex({
        schema: 'public',
        table: 'Users',
        index: 'Users_email_trgm_idx',
        expression: 'email gin_trgm_ops',
        extras: { type: 'gin' },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
