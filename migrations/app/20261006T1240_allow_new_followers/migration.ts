#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/193a75f94415e5bfdcf27207588c74525f363c791aac13cb462ba50c41a453b7/contract';
import endContract from '../../snapshots/193a75f94415e5bfdcf27207588c74525f363c791aac13cb462ba50c41a453b7/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/fb29c247b55a130f8849ece74a8a4917ce99ac86c914af01c60828bd3be02ef7/contract';
import startContract from '../../snapshots/fb29c247b55a130f8849ece74a8a4917ce99ac86c914af01c60828bd3be02ef7/contract.json' with { type: 'json' };
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
