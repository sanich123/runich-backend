#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/259f8d1ae7b33173f81399515933481f656ffee90e4976acc7b303e0c47e62c5/contract';
import endContract from '../../snapshots/259f8d1ae7b33173f81399515933481f656ffee90e4976acc7b303e0c47e62c5/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/b9fea1a401b872f4d1c8369913db9de66706270ea50df045a55ef0d6a1e75eac/contract';
import startContract from '../../snapshots/b9fea1a401b872f4d1c8369913db9de66706270ea50df045a55ef0d6a1e75eac/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Profile',
        column: col('profile_photo_pending_asset_id', 'text', {
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Profile',
        column: col('profile_photo_pending_blurhash', 'text', {
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
