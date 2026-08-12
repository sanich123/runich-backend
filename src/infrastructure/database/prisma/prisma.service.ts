import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { seedMockData } from './mock-seed';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL!,
      }),
      log: [
        {
          emit: 'event',
          level: 'query',
        },
        {
          emit: 'event',
          level: 'error',
        },
        {
          emit: 'event',
          level: 'info',
        },
        {
          emit: 'event',
          level: 'warn',
        },
      ],
    });
  }
  async onModuleInit() {
    this.$on('error' as never, ({ message }) => this.logger.error(`Ошибка Prisma: ${message}`));
    this.$on('warn' as never, ({ message }) => this.logger.warn(`Предупреждение Prisma: ${message}`));
    this.$on('info' as never, ({ message }) => this.logger.debug(message));
    this.$on('query' as never, () => this.logger.debug('Prisma query executed'));

    try {
      await this.$connect();
      if (process.env.SEED_MOCK_DATA === 'true') {
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
