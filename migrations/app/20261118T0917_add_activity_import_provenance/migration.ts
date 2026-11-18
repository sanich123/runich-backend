#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/4ca174a4e9755d2980eaf6c7ad810e7a78f5ac98dbf442243ff07ba7faa7c49e/contract';
import startContract from '../../snapshots/4ca174a4e9755d2980eaf6c7ad810e7a78f5ac98dbf442243ff07ba7faa7c49e/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/ffe39931e9232f247c4263bd97e46e55ca027b4cd9e17a03d74fdfa7235c2bf3/contract';
import endContract from '../../snapshots/ffe39931e9232f247c4263bd97e46e55ca027b4cd9e17a03d74fdfa7235c2bf3/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Activity',
        column: col('recording_device_manufacturer', 'character varying(128)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 128 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Activity',
        column: col('recording_device_model', 'character varying(128)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 128 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Activity',
        column: col('source_app_name', 'character varying(128)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 128 } },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
