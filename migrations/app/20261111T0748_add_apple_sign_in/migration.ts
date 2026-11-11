#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/1d490068eb085eaa563a0d25ab41b1ead1ca7c34cc27d75328860e6a70bf13e3/contract';
import endContract from '../../snapshots/1d490068eb085eaa563a0d25ab41b1ead1ca7c34cc27d75328860e6a70bf13e3/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/6fdd1da2fcba0e6b71e090968b49587a573d2945052031afb803048e508f5d8f/contract';
import startContract from '../../snapshots/6fdd1da2fcba0e6b71e090968b49587a573d2945052031afb803048e508f5d8f/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Users',
        column: col('apple_subject', 'character varying(255)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
        }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'Users',
        constraint: 'User_apple_subject_key',
        columns: ['apple_subject'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
