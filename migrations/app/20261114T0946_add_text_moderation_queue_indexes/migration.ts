#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/b3ec3b8f7f02095e0fb6999f37255c8e096d93be799f93e7bbfe764ce6ad437e/contract';
import endContract from '../../snapshots/b3ec3b8f7f02095e0fb6999f37255c8e096d93be799f93e7bbfe764ce6ad437e/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/efaff73a1d0c739fb5d6e31c4c1620ab73277ca4fcd6e71af28c24d8ede56750/contract';
import startContract from '../../snapshots/efaff73a1d0c739fb5d6e31c4c1620ab73277ca4fcd6e71af28c24d8ede56750/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createIndex({
        schema: 'public',
        table: 'Activity',
        index: 'Activity_text_moderation_status_updated_at_id_idx',
        columns: ['text_moderation_status', 'updatedAt', 'id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Comment',
        index: 'Comment_moderation_status_date_id_idx',
        columns: ['moderation_status', 'date', 'id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ContentReport',
        index: 'ContentReport_comment_target_status_idx',
        columns: ['comment_id', 'target_type', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GroupPost',
        index: 'GroupPost_moderation_status_created_at_id_idx',
        columns: ['moderation_status', 'created_at', 'id'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
