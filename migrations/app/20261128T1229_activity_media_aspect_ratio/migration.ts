#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/b5035b254ef473dd204a61c8b00c7dd0b715ec2e878fafbcb06aa4725d32478b/contract';
import endContract from '../../snapshots/b5035b254ef473dd204a61c8b00c7dd0b715ec2e878fafbcb06aa4725d32478b/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/fe587b83b4b648d68a452c3e10239235203f1c6316d4df94f519e61b7ece22ea/contract';
import startContract from '../../snapshots/fe587b83b4b648d68a452c3e10239235203f1c6316d4df94f519e61b7ece22ea/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'ActivityMedia',
        column: col('aspect_ratio', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'MediaModerationAsset',
        column: col('aspect_ratio', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
