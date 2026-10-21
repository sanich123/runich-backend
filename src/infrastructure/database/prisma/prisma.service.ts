import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { Pool } from 'pg';
import { shouldSeedMockData } from 'src/common/config/environment';
import { LatencyMetricsService } from 'src/common/metrics/latency-metrics.service';
import { seedMockData } from './mock-seed';
import { createDatabaseRepositories, DatabaseRepositories, RuntimeClient } from './database-repository';
import { databaseClient } from './client';
import { getDatabaseUrl } from 'src/common/config/environment';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private client: RuntimeClient;
  private readonly pool?: Pool;
  private mockSeedPromise?: Promise<void>;
  private latencyMetrics?: LatencyMetricsService;
  readonly user!: DatabaseRepositories['user'];
  readonly userSession!: DatabaseRepositories['userSession'];
  readonly authExchange!: DatabaseRepositories['authExchange'];
  readonly profile!: DatabaseRepositories['profile'];
  readonly activity!: DatabaseRepositories['activity'];
  readonly activityMedia!: DatabaseRepositories['activityMedia'];
  readonly activityMigrationJob!: DatabaseRepositories['activityMigrationJob'];
  readonly subscription!: DatabaseRepositories['subscription'];
  readonly mediaCleanupJob!: DatabaseRepositories['mediaCleanupJob'];
  readonly emailNotificationJob!: DatabaseRepositories['emailNotificationJob'];
  readonly notification!: DatabaseRepositories['notification'];
  readonly pushDeviceToken!: DatabaseRepositories['pushDeviceToken'];
  readonly pushNotificationJob!: DatabaseRepositories['pushNotificationJob'];
  readonly loadTestSeedJob!: DatabaseRepositories['loadTestSeedJob'];
  readonly friend!: DatabaseRepositories['friend'];
  readonly comment!: DatabaseRepositories['comment'];
  readonly commentLike!: DatabaseRepositories['commentLike'];
  readonly like!: DatabaseRepositories['like'];

  constructor(@Optional() @Inject(LatencyMetricsService) latencyMetrics?: LatencyMetricsService) {
    this.client = databaseClient;
    this.latencyMetrics = latencyMetrics;
    this.pool = new Pool({ connectionString: getDatabaseUrl() });
    this.assignDelegates(databaseClient);
  }

  private assignDelegates(client: RuntimeClient) {
    Object.assign(this, createDatabaseRepositories(client, this.latencyMetrics));
  }

  private static fromClient(client: RuntimeClient, latencyMetrics?: LatencyMetricsService) {
    const service = Object.create(PrismaService.prototype) as PrismaService;
    service.client = client;
    service.latencyMetrics = latencyMetrics;
    service.assignDelegates(client);
    return service;
  }

  async $connect() {
    await this.client.connect();
  }

  async $disconnect() {
    if (this.client === databaseClient) await databaseClient.close();
    if (this.pool) await this.pool.end();
  }

  async $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T> {
    if (!this.pool) throw new Error('Raw queries are unavailable inside a Prisma transaction callback');
    const startedAt = performance.now();
    try {
      const text = strings.reduce(
        (query, chunk, index) => `${query}${chunk}${index < values.length ? `$${index + 1}` : ''}`,
        '',
      );
      return (await this.pool.query(text, values)).rows as T;
    } finally {
      this.latencyMetrics?.observeDatabase('raw', performance.now() - startedAt);
    }
  }

  $transaction<T>(input: Promise<T>[], options?: unknown): Promise<T[]>;
  $transaction<T>(input: (transaction: PrismaService) => Promise<T>, options?: unknown): Promise<T>;
  async $transaction<T>(input: Promise<T>[] | ((transaction: PrismaService) => Promise<T>)): Promise<T[] | T> {
    if (Array.isArray(input)) return Promise.all(input);
    return this.client.transaction(async (transactionClient) =>
      input(PrismaService.fromClient(transactionClient as unknown as RuntimeClient, this.latencyMetrics)),
    ) as Promise<T>;
  }
  async onModuleInit() {
    try {
      await this.$connect();
      if (shouldSeedMockData() && process.env.RUNICH_PROCESS !== 'worker') {
        this.mockSeedPromise = seedMockData(this)
          .then(() => {
            this.logger.log('Mock seed завершён');
          })
          .catch((error) => {
            this.logger.error(
              'Не удалось заполнить базу mock-данными',
              error instanceof Error ? error.stack : String(error),
            );
          });
        this.logger.log('Mock seed запущен в фоне');
      }
    } catch (error) {
      this.logger.error('Не удалось подключиться к базе данных', error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.mockSeedPromise;
      await this.$disconnect();
    } catch (error) {
      this.logger.error('Не удалось отключиться от базы данных', error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }
}
