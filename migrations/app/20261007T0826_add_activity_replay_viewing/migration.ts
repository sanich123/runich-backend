#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/03d055be0b6567ba1203b7cb0c127e4f16ab2f8e706c6c305f2ef2dcb1aa544d/contract';
import endContract from '../../snapshots/03d055be0b6567ba1203b7cb0c127e4f16ab2f8e706c6c305f2ef2dcb1aa544d/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/4e8b94e1e072b032e7e4f19a40918ea24d37c3838ee777493fb8183dd976e040/contract';
import startContract from '../../snapshots/4e8b94e1e072b032e7e4f19a40918ea24d37c3838ee777493fb8183dd976e040/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Profile',
        column: col('allow_activity_replay_viewing', 'bool', {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
