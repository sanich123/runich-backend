#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/b9fea1a401b872f4d1c8369913db9de66706270ea50df045a55ef0d6a1e75eac/contract';
import endContract from '../../snapshots/b9fea1a401b872f4d1c8369913db9de66706270ea50df045a55ef0d6a1e75eac/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/ee87d74127e76bc9e86c47ee60feabc170f0e913cc0ac7892337f26bb162c69d/contract';
import startContract from '../../snapshots/ee87d74127e76bc9e86c47ee60feabc170f0e913cc0ac7892337f26bb162c69d/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'GoogleVisionMonthlyUsage',
        columns: [
          col('month_key', 'character varying(7)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 7 } },
          }),
          col('used_units', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [primaryKey(['month_key'])],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
