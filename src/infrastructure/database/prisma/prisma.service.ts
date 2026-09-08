import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { seedMockData } from './mock-seed';
import { createDatabaseRepositories, DatabaseRepositories, RuntimeClient } from './database-repository';
import { databaseClient } from './client';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private client: RuntimeClient;
  private readonly pool?: Pool;
  readonly user!: DatabaseRepositories['user'];
  readonly userSession!: DatabaseRepositories['userSession'];
  readonly authExchange!: DatabaseRepositories['authExchange'];
  readonly profile!: DatabaseRepositories['profile'];
  readonly activity!: DatabaseRepositories['activity'];
  readonly activityMigrationJob!: DatabaseRepositories['activityMigrationJob'];
  readonly mediaCleanupJob!: DatabaseRepositories['mediaCleanupJob'];
  readonly friend!: DatabaseRepositories['friend'];
  readonly comment!: DatabaseRepositories['comment'];
  readonly commentLike!: DatabaseRepositories['commentLike'];
  readonly like!: DatabaseRepositories['like'];

  constructor() {
    this.client = databaseClient;
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    this.assignDelegates(databaseClient);
  }

  private assignDelegates(client: RuntimeClient) {
    Object.assign(this, createDatabaseRepositories(client));
  }

  private static fromClient(client: RuntimeClient) {
    const service = Object.create(PrismaService.prototype) as PrismaService;
    service.client = client;
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

  async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
    if (!this.pool) throw new Error('Raw queries are unavailable inside a Prisma transaction callback');
    const text = strings.reduce(
      (query, chunk, index) => `${query}${chunk}${index < values.length ? `$${index + 1}` : ''}`,
      '',
    );
    return (await this.pool.query(text, values)).rows;
  }

  $transaction<T>(input: Promise<T>[], options?: unknown): Promise<T[]>;
  $transaction<T>(input: (transaction: PrismaService) => Promise<T>, options?: unknown): Promise<T>;
  async $transaction<T>(input: Promise<T>[] | ((transaction: PrismaService) => Promise<T>)): Promise<T[] | T> {
    if (Array.isArray(input)) return Promise.all(input);
    return this.client.transaction(async (transactionClient) =>
      input(PrismaService.fromClient(transactionClient as unknown as RuntimeClient)),
    ) as Promise<T>;
  }
  async onModuleInit() {
    try {
      await this.$connect();
      if (process.env.SEED_MOCK_DATA === 'true' && process.env.RUNICH_PROCESS !== 'worker') {
        await seedMockData(this);
      }
    } catch (error) {
      this.logger.error('Не удалось подключиться к базе данных', error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
    } catch (error) {
      this.logger.error('Не удалось отключиться от базы данных', error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }
}
