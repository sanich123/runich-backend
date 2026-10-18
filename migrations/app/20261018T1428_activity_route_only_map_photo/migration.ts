#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/f1dd719c21846417bd900b7c525c82cdeacf8f4fae474136912a3cd1e66e2889/contract';
import startContract from '../../snapshots/f1dd719c21846417bd900b7c525c82cdeacf8f4fae474136912a3cd1e66e2889/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/f451c32846d8846087e2d684a9433d7a4d158b03052219e1224078dc480b0753/contract';
import endContract from '../../snapshots/f451c32846d8846087e2d684a9433d7a4d158b03052219e1224078dc480b0753/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Activity',
        column: col('route_only_map_photo_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
