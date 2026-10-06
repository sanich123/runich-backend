#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/7f00e2fabdb302c3c5393c4aabe74d51c5f0a9b4309c14be4826ddb06175f0d4/contract';
import endContract from '../../snapshots/7f00e2fabdb302c3c5393c4aabe74d51c5f0a9b4309c14be4826ddb06175f0d4/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/d08a304c28b0916f3a3ab56d933cf5cb2b787c70e10406aae53811de1a9ed032/contract';
import startContract from '../../snapshots/d08a304c28b0916f3a3ab56d933cf5cb2b787c70e10406aae53811de1a9ed032/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Profile',
        column: col('allow_activity_sharing', 'bool', {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
