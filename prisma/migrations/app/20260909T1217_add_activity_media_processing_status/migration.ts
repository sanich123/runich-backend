#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/1b3187968c7d81a0ca8577d40a63b9c9c305fd84f20c6be29bc8d712a72e78ea/contract';
import startContract from '../../snapshots/1b3187968c7d81a0ca8577d40a63b9c9c305fd84f20c6be29bc8d712a72e78ea/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/7f70661718650c7e441bbd1d756c20d0ad33d42fad6a26f5bdd9868d3c639526/contract';
import endContract from '../../snapshots/7f70661718650c7e441bbd1d756c20d0ad33d42fad6a26f5bdd9868d3c639526/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Activity',
        column: col('media_processing_status', 'character varying(16)', {
          notNull: true,
          default: lit('queued'),
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 16 } },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
