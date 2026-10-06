#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/9485b1c0d30333c9b67c513c525784c58a78a0517b65d8e15d12d73fd879fb24/contract';
import startContract from '../../snapshots/9485b1c0d30333c9b67c513c525784c58a78a0517b65d8e15d12d73fd879fb24/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/d08a304c28b0916f3a3ab56d933cf5cb2b787c70e10406aae53811de1a9ed032/contract';
import endContract from '../../snapshots/d08a304c28b0916f3a3ab56d933cf5cb2b787c70e10406aae53811de1a9ed032/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Profile',
        column: col('allow_likes_list_viewing', 'bool', {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
