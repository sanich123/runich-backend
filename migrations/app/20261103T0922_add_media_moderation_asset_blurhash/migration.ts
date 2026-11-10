#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/6fdd1da2fcba0e6b71e090968b49587a573d2945052031afb803048e508f5d8f/contract';
import endContract from '../../snapshots/6fdd1da2fcba0e6b71e090968b49587a573d2945052031afb803048e508f5d8f/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/a6d0a5018be80f2d7c43d0dd8f0838ce0bff3dbd68c136ef7fa2d7c2b4b693bf/contract';
import startContract from '../../snapshots/a6d0a5018be80f2d7c43d0dd8f0838ce0bff3dbd68c136ef7fa2d7c2b4b693bf/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'MediaModerationAsset',
        column: col('blurhash', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
