#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/4e8b94e1e072b032e7e4f19a40918ea24d37c3838ee777493fb8183dd976e040/contract';
import endContract from '../../snapshots/4e8b94e1e072b032e7e4f19a40918ea24d37c3838ee777493fb8183dd976e040/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/7f00e2fabdb302c3c5393c4aabe74d51c5f0a9b4309c14be4826ddb06175f0d4/contract';
import startContract from '../../snapshots/7f00e2fabdb302c3c5393c4aabe74d51c5f0a9b4309c14be4826ddb06175f0d4/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Profile',
        column: col('allow_new_followers', 'bool', {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
