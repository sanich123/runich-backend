#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/03d055be0b6567ba1203b7cb0c127e4f16ab2f8e706c6c305f2ef2dcb1aa544d/contract';
import startContract from '../../snapshots/03d055be0b6567ba1203b7cb0c127e4f16ab2f8e706c6c305f2ef2dcb1aa544d/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/5343e85c5d034a865f61fb4dcc567998ca2fa99f483a3edc8c3c51ecb5353ba7/contract';
import endContract from '../../snapshots/5343e85c5d034a865f61fb4dcc567998ca2fa99f483a3edc8c3c51ecb5353ba7/contract.json' with { type: 'json' };
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
