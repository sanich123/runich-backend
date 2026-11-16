#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/89dfeed8d75c41dd73e3559493d8e9b730d7b8ec8efbef9209e3b9e4c832afaf/contract';
import startContract from '../../snapshots/89dfeed8d75c41dd73e3559493d8e9b730d7b8ec8efbef9209e3b9e4c832afaf/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/efaff73a1d0c739fb5d6e31c4c1620ab73277ca4fcd6e71af28c24d8ede56750/contract';
import endContract from '../../snapshots/efaff73a1d0c739fb5d6e31c4c1620ab73277ca4fcd6e71af28c24d8ede56750/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'Activity',
        constraint: 'Activity_moderation_status_check_9e17caab',
      }),
      this.dropCheckConstraint({
        schema: 'public',
        table: 'ActivityMedia',
        constraint: 'ActivityMedia_moderation_status_check_9e17caab',
      }),
      this.dropCheckConstraint({
        schema: 'public',
        table: 'Comment',
        constraint: 'Comment_moderation_status_check_9e17caab',
      }),
      this.dropCheckConstraint({
        schema: 'public',
        table: 'ContentReport',
        constraint: 'ContentReport_target_type_check_e609e753',
      }),
      this.dropCheckConstraint({
        schema: 'public',
        table: 'Group',
        constraint: 'Group_moderation_status_check_9e17caab',
      }),
      this.addColumn({
        schema: 'public',
        table: 'Activity',
        column: col('text_moderation_processing_started_at', 'timestamptz(6)', {
          codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Activity',
        column: col('text_moderation_status', 'text', {
          notNull: true,
          default: lit('visible'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Comment',
        column: col('moderation_processing_started_at', 'timestamptz(6)', {
          codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ContentReport',
        column: col('group_post_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'GroupPost',
        column: col('moderation_processing_started_at', 'timestamptz(6)', {
          codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'GroupPost',
        column: col('moderation_status', 'text', {
          notNull: true,
          default: lit('visible'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Activity',
        constraint: 'Activity_moderation_status_check_364741d2',
        expression: sql`"moderation_status" IN ('pending', 'processing', 'visible', 'hidden', 'removed')`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Activity',
        constraint: 'Activity_text_moderation_status_check_76966950',
        expression: sql`"text_moderation_status" IN ('pending', 'processing', 'visible', 'hidden', 'removed')`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'ActivityMedia',
        constraint: 'ActivityMedia_moderation_status_check_364741d2',
        expression: sql`"moderation_status" IN ('pending', 'processing', 'visible', 'hidden', 'removed')`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Comment',
        constraint: 'Comment_moderation_status_check_364741d2',
        expression: sql`"moderation_status" IN ('pending', 'processing', 'visible', 'hidden', 'removed')`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'ContentReport',
        constraint: 'ContentReport_target_type_check_b3bc0520',
        expression: sql`"target_type" IN ('activity', 'activity_text', 'comment', 'group_post', 'media', 'media_upload', 'user', 'group')`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Group',
        constraint: 'Group_moderation_status_check_364741d2',
        expression: sql`"moderation_status" IN ('pending', 'processing', 'visible', 'hidden', 'removed')`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'GroupPost',
        constraint: 'GroupPost_moderation_status_check_364741d2',
        expression: sql`"moderation_status" IN ('pending', 'processing', 'visible', 'hidden', 'removed')`,
      }),
      this.createIndex({
        schema: 'public',
        table: 'ContentReport',
        index: 'ContentReport_group_post_id_idx',
        columns: ['group_post_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ContentReport',
        foreignKey: {
          name: 'ContentReport_group_post_id_fkey',
          columns: ['group_post_id'],
          references: { schema: 'public', table: 'GroupPost', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
