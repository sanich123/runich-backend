/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma ORM collections are dynamic at this boundary. */
import { param } from '@prisma/orm-postgres/relational-core/expression';
import type { LatencyMetricsService } from 'src/common/metrics/latency-metrics.service';
import { databaseClient } from './client';
import { getCodecId, quoteIdentifier, SQL_CASTS } from './database-repository.metadata';
import type { AnyRecord, ModelName, RawSqlBuilder, RuntimeClient } from './database-repository.metadata';
import {
  applyOptions,
  normalizeCriterion,
  normalizeMutationInput,
  normalizeOutput,
  restoreCountShape,
} from './database-repository.query';
import type { CountSpec } from './database-repository.query';

export type { RuntimeClient };

export class ModelRepository {
  constructor(
    private readonly client: RuntimeClient,
    private readonly model: ModelName,
    private readonly latencyMetrics?: LatencyMetricsService,
  ) {}

  private get root(): AnyRecord {
    return (this.client.orm as AnyRecord).public[this.model];
  }

  private async read(options: AnyRecord | undefined, first: boolean) {
    const countSpecs: CountSpec[] = [];
    const collection = applyOptions(this.root, this.model, options, countSpecs);
    const row = first ? await collection.first() : await collection.all();
    const normalized = normalizeOutput(this.model, row);
    return first
      ? restoreCountShape(normalized, countSpecs)
      : (normalized as unknown[]).map((item) => restoreCountShape(item, countSpecs));
  }

  private async measure<T>(operation: string, action: () => Promise<T>) {
    const startedAt = performance.now();
    try {
      return await action();
    } finally {
      this.latencyMetrics?.observeDatabase(`${this.model}.${operation}`, performance.now() - startedAt);
    }
  }

  findUnique(options: AnyRecord): Promise<any> {
    return this.measure('findUnique', () => this.read(options, true));
  }

  findFirst(options: AnyRecord): Promise<any> {
    return this.measure('findFirst', () => this.read(options, true));
  }

  findMany(options?: AnyRecord): Promise<any> {
    return this.measure('findMany', () => this.read(options, false));
  }

  count(options?: AnyRecord): Promise<number> {
    return this.measure('count', async () => {
      const collection = applyOptions(this.root, this.model, options, []);
      const result = await collection.aggregate((aggregate: AnyRecord) => ({ count: aggregate.count() }));
      return result.count;
    });
  }

  create(options: AnyRecord): Promise<any> {
    return this.measure('create', async () => {
      const countSpecs: CountSpec[] = [];
      const collection = applyOptions(this.root, this.model, options, countSpecs);
      const row = await collection.create(normalizeMutationInput(this.model, options.data));
      return restoreCountShape(normalizeOutput(this.model, row), countSpecs);
    });
  }

  private executePlan(plan: AnyRecord) {
    const client = this.client as AnyRecord;
    if (typeof client.execute === 'function') return client.execute(plan);
    return client.runtime().execute(plan);
  }

  private buildBulkInsertPlan(rows: AnyRecord[], fields: string[], skipDuplicates: boolean) {
    const modelSpec = (databaseClient.contract as AnyRecord).domain.namespaces.public.models[this.model];
    const storageFields = modelSpec.storage.fields as AnyRecord;
    const table = modelSpec.storage.table as string;
    const quotedColumns = fields.map((field) => quoteIdentifier(storageFields[field].column as string));
    const parts: string[] = [
      `INSERT INTO ${quoteIdentifier('public')}.${quoteIdentifier(table)} (${quotedColumns.join(', ')}) VALUES (`,
    ];
    const values: unknown[] = [];

    rows.forEach((row, rowIndex) => {
      fields.forEach((field, fieldIndex) => {
        const codecId = getCodecId(modelSpec, field);
        const cast = codecId ? SQL_CASTS[codecId.split('@')[0]] : undefined;
        if (!codecId || !cast) throw new Error(`Unsupported bulk insert field codec: ${this.model}.${field}`);

        values.push(param(row[field], { codecId }));
        const isLastField = fieldIndex === fields.length - 1;
        const rowSeparator = rowIndex === rows.length - 1 ? ')' : '), (';
        parts.push(`::${cast}${isLastField ? rowSeparator : ', '}`);
      });
    });

    if (skipDuplicates) parts[parts.length - 1] += ' ON CONFLICT DO NOTHING';

    const templateStrings = Object.assign([...parts], { raw: [...parts] }) as unknown as TemplateStringsArray;
    const rawPlan = (databaseClient.raw.sql as unknown as RawSqlBuilder)(templateStrings, ...values);
    return rawPlan.affectedCount().build();
  }

  createMany(options: AnyRecord): Promise<{ count: number }> {
    return this.measure('createMany', async () => {
      const data = options.data as AnyRecord[];
      if (!data.length) return { count: 0 };

      const modelSpec = (databaseClient.contract as AnyRecord).domain.namespaces.public.models[this.model];
      const modelFields = modelSpec.fields as AnyRecord;
      const rowsByShape = new Map<string, { fields: string[]; rows: AnyRecord[] }>();

      for (const item of data) {
        const normalized = normalizeMutationInput(this.model, item) as AnyRecord;
        const row = Object.fromEntries(
          Object.entries(normalized).filter(([field, value]) => field in modelFields && value !== undefined),
        );
        const fields = Object.keys(row).sort();
        const shape = fields.join('\u0000');
        const group = rowsByShape.get(shape) ?? { fields, rows: [] };
        group.rows.push(row);
        rowsByShape.set(shape, group);
      }

      let count = 0;
      for (const { fields, rows } of rowsByShape.values()) {
        if (!fields.length) throw new Error(`Bulk insert requires at least one scalar field: ${this.model}`);
        const result = await this.executePlan(this.buildBulkInsertPlan(rows, fields, options.skipDuplicates === true));
        count += Number(result.affectedRows ?? 0);
      }

      return { count };
    });
  }

  update(options: AnyRecord): Promise<any> {
    return this.measure('update', async () => {
      const countSpecs: CountSpec[] = [];
      const collection = applyOptions(this.root, this.model, options, countSpecs);
      const row = await collection.update(normalizeMutationInput(this.model, options.data));
      return restoreCountShape(normalizeOutput(this.model, row), countSpecs);
    });
  }

  updateMany(options: AnyRecord): Promise<{ count: number }> {
    return this.measure('updateMany', async () => {
      const collection = applyOptions(this.root, this.model, options, []);
      return { count: await collection.updateAndCount(normalizeMutationInput(this.model, options.data)) };
    });
  }

  delete(options: AnyRecord): Promise<any> {
    return this.measure('delete', async () => {
      const collection = applyOptions(this.root, this.model, options, []);
      return normalizeOutput(this.model, await collection.delete());
    });
  }

  deleteMany(options: AnyRecord): Promise<{ count: number }> {
    return this.measure('deleteMany', async () => {
      const collection = applyOptions(this.root, this.model, options, []);
      return { count: await collection.deleteAndCount() };
    });
  }

  upsert(options: AnyRecord): Promise<any> {
    return this.measure('upsert', async () => {
      const countSpecs: CountSpec[] = [];
      const collection = applyOptions(this.root, this.model, options, countSpecs);
      const row = await collection.upsert({
        create: normalizeMutationInput(this.model, options.create),
        update: normalizeMutationInput(this.model, options.update),
        conflictOn: normalizeCriterion(this.model, options.where),
      });
      return restoreCountShape(normalizeOutput(this.model, row), countSpecs);
    });
  }
}

export function createDatabaseRepositories(client: RuntimeClient, latencyMetrics?: LatencyMetricsService) {
  return {
    user: new ModelRepository(client, 'User', latencyMetrics),
    userSession: new ModelRepository(client, 'UserSession', latencyMetrics),
    authExchange: new ModelRepository(client, 'AuthExchange', latencyMetrics),
    profile: new ModelRepository(client, 'Profile', latencyMetrics),
    activity: new ModelRepository(client, 'Activity', latencyMetrics),
    activityMedia: new ModelRepository(client, 'ActivityMedia', latencyMetrics),
    activityMigrationJob: new ModelRepository(client, 'ActivityMigrationJob', latencyMetrics),
    subscription: new ModelRepository(client, 'Subscription', latencyMetrics),
    mediaCleanupJob: new ModelRepository(client, 'MediaCleanupJob', latencyMetrics),
    emailNotificationJob: new ModelRepository(client, 'EmailNotificationJob', latencyMetrics),
    notification: new ModelRepository(client, 'Notification', latencyMetrics),
    pushDeviceToken: new ModelRepository(client, 'PushDeviceToken', latencyMetrics),
    pushNotificationJob: new ModelRepository(client, 'PushNotificationJob', latencyMetrics),
    loadTestSeedJob: new ModelRepository(client, 'LoadTestSeedJob', latencyMetrics),
    friend: new ModelRepository(client, 'Friend', latencyMetrics),
    comment: new ModelRepository(client, 'Comment', latencyMetrics),
    commentLike: new ModelRepository(client, 'CommentLike', latencyMetrics),
    like: new ModelRepository(client, 'Like', latencyMetrics),
    contentReport: new ModelRepository(client, 'ContentReport', latencyMetrics),
    userBlock: new ModelRepository(client, 'UserBlock', latencyMetrics),
    moderationAction: new ModelRepository(client, 'ModerationAction', latencyMetrics),
    moderationAppeal: new ModelRepository(client, 'ModerationAppeal', latencyMetrics),
    mediaModerationAsset: new ModelRepository(client, 'MediaModerationAsset', latencyMetrics),
    adminRoleAssignment: new ModelRepository(client, 'AdminRoleAssignment', latencyMetrics),
    adminAccessAudit: new ModelRepository(client, 'AdminAccessAudit', latencyMetrics),
    group: new ModelRepository(client, 'Group', latencyMetrics),
    groupMember: new ModelRepository(client, 'GroupMember', latencyMetrics),
    groupPost: new ModelRepository(client, 'GroupPost', latencyMetrics),
    groupEvent: new ModelRepository(client, 'GroupEvent', latencyMetrics),
  };
}

export type DatabaseRepositories = ReturnType<typeof createDatabaseRepositories>;
