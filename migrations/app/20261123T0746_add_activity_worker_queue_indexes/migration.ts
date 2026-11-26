#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/08d305c4383245b6a5fbbeb9940aca147f0e6b0d633f6346f185d469bed4be29/contract';
import endContract from '../../snapshots/08d305c4383245b6a5fbbeb9940aca147f0e6b0d633f6346f185d469bed4be29/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/ffe39931e9232f247c4263bd97e46e55ca027b4cd9e17a03d74fdfa7235c2bf3/contract';
import startContract from '../../snapshots/ffe39931e9232f247c4263bd97e46e55ca027b4cd9e17a03d74fdfa7235c2bf3/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createIndex({
        schema: 'public',
        table: 'Activity',
        index: 'Activity_location_enrichment_status_created_at_id_idx',
        columns: ['location_enrichment_status', 'createdAt', 'id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Activity',
        index: 'Activity_media_processing_status_created_at_id_idx',
        columns: ['media_processing_status', 'createdAt', 'id'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
