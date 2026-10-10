#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/01c5a22ff539046f9521b1e04520487c00bcced81776e6444e4265c7d3b7265a/contract';
import startContract from '../../snapshots/01c5a22ff539046f9521b1e04520487c00bcced81776e6444e4265c7d3b7265a/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/5f5bc69fb5839e7dfecf35e6593e6f7cae7ec222dd2e5ad1d83d5b73531280a1/contract';
import endContract from '../../snapshots/5f5bc69fb5839e7dfecf35e6593e6f7cae7ec222dd2e5ad1d83d5b73531280a1/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: 'preserveActivityInteractionPrivacy.Profile',
        label: 'Preserve disabled likes-list access in activity interaction privacy',
        operationClass: 'data',
        target: {
          id: 'postgres',
          details: { schema: 'public', objectType: 'table', name: 'Profile' },
        },
        precheck: [
          {
            description: 'ensure the Profile table is available for privacy backfill',
            sql: 'SELECT TRUE AS "result"',
            params: [],
          },
        ],
        execute: [
          {
            description: 'disable activity interactions for profiles with a disabled likes list',
            sql: 'UPDATE "public"."Profile" SET "allow_activity_interactions" = false WHERE "allow_likes_list_viewing" = false AND "allow_activity_interactions" = true',
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify no disabled likes list is exposed by activity interactions',
            sql: 'SELECT NOT EXISTS (SELECT 1 FROM "public"."Profile" WHERE "allow_likes_list_viewing" = false AND "allow_activity_interactions" = true) AS "result"',
            params: [],
          },
        ],
      }),
      this.dropColumn({ schema: 'public', table: 'Profile', column: 'allow_likes_list_viewing' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
