import { MiddlewareConsumer, Module } from '@nestjs/common';
import { AccountModule } from 'src/account/account.module';

import LoggingService from 'src/logger/logger.middleware';
import { PrismaModule } from 'src/prisma/prisma.module';
import { UserModule } from 'src/user/user.module';

@Module({ imports: [AccountModule, UserModule, PrismaModule] })
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingService).forRoutes('*');
  }
}
