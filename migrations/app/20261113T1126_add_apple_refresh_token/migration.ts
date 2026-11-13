#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/1d490068eb085eaa563a0d25ab41b1ead1ca7c34cc27d75328860e6a70bf13e3/contract';
import startContract from '../../snapshots/1d490068eb085eaa563a0d25ab41b1ead1ca7c34cc27d75328860e6a70bf13e3/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/89dfeed8d75c41dd73e3559493d8e9b730d7b8ec8efbef9209e3b9e4c832afaf/contract';
import endContract from '../../snapshots/89dfeed8d75c41dd73e3559493d8e9b730d7b8ec8efbef9209e3b9e4c832afaf/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Users',
        column: col('apple_refresh_token_encrypted', 'character varying(4096)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 4096 } },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
