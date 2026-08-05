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
    await this.$connect();
    if (process.env.SEED_MOCK_DATA === 'true') {
      await seedMockData(this);
    }
    this.$on('error' as never, ({ message }) => this.logger.error(message));
    this.$on('warn' as never, ({ message }) => this.logger.warn(message));
    this.$on('info' as never, ({ message }) => this.logger.debug(message));
    this.$on('query' as never, ({ query, params }) => this.logger.log(`${query}; ${params}`));
  }

  categorySoftDeleteMiddleware = async (params, next) => {
    if (params.action === 'delete') {
      return next({
        ...params,
        action: 'update',
        args: {
          ...params.args,
          data: {
            deletedAt: new Date(),
          },
        },
      });
    }
    return next(params);
  };

  loggingMiddleware = async (params, next) => {
    console.log(`${params.action} ${params.model} ${JSON.stringify(params.args)}`);
    const result = await next(params);
    console.log(result);
    return result;
  };

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
