#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/7cbcc982fb9d3f3d4b35bb9777e12c69718f9a4ce209f2e292d44d36a5a73ee0/contract';
import startContract from '../../snapshots/7cbcc982fb9d3f3d4b35bb9777e12c69718f9a4ce209f2e292d44d36a5a73ee0/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/dc04cb7e1d6a3db4146fdba07c6b6c32b1af4c991eac31f39ec9217288046fd6/contract';
import endContract from '../../snapshots/dc04cb7e1d6a3db4146fdba07c6b6c32b1af4c991eac31f39ec9217288046fd6/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'ContentReport',
        constraint: 'ContentReport_target_type_check_15fa25b2',
      }),
      this.addColumn({
        schema: 'public',
        table: 'Group',
        column: col('moderation_status', 'text', {
          notNull: true,
          default: lit('visible'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'ContentReport',
        constraint: 'ContentReport_target_type_check_e609e753',
        expression: sql`"target_type" IN ('activity', 'comment', 'media', 'media_upload', 'user', 'group')`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Group',
        constraint: 'Group_moderation_status_check_9e17caab',
        expression: sql`"moderation_status" IN ('visible', 'hidden', 'removed')`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
