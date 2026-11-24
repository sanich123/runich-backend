#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/08d305c4383245b6a5fbbeb9940aca147f0e6b0d633f6346f185d469bed4be29/contract';
import startContract from '../../snapshots/08d305c4383245b6a5fbbeb9940aca147f0e6b0d633f6346f185d469bed4be29/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/fe587b83b4b648d68a452c3e10239235203f1c6316d4df94f519e61b7ece22ea/contract';
import endContract from '../../snapshots/fe587b83b4b648d68a452c3e10239235203f1c6316d4df94f519e61b7ece22ea/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [this.dropTable({ schema: 'public', table: 'LoadTestSeedJob' })];
  }
}

MigrationCLI.run(import.meta.url, M);
