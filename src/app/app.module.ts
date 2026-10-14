import { MiddlewareConsumer, Module } from '@nestjs/common';

import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { UserModule } from 'src/user/user.module';
import { ActivityModule } from 'src/activity/activity.module';
import { FriendModule } from 'src/friend/friend.module';
import { AccountModule } from 'src/account/account.module';
import { CommentModule } from 'src/comment/comment.module';
import { LikeModule } from 'src/like/like.module';
import { StatisticModule } from 'src/statistic/statistic.module';
import { EmailModule } from 'src/email/email.module';
import { AuthModule } from 'src/auth/auth.module';
import { HealthModule } from 'src/health/health.module';
import LoggingService from 'src/common/logger/logger.middleware';
import { ThrottlerModule } from '@nestjs/throttler';
import { StorageModule } from 'src/storage/storage.module';
import { SubscriptionModule } from 'src/subscription/subscription.module';
import { LoadTestModule } from 'src/load-test/load-test.module';
import { observeImports } from 'src/common/observe/observe.config';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [
    ...observeImports,
    ThrottlerModule.forRoot([{ name: 'default', limit: 5, ttl: 60_000 }]),
    UserModule,
    PrismaModule,
    ActivityModule,
    FriendModule,
    AccountModule,
    CommentModule,
    LikeModule,
    StatisticModule,
    EmailModule,
    NotificationModule,
    AuthModule,
    HealthModule,
    StorageModule,
    SubscriptionModule,
    LoadTestModule,
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingService).forRoutes('*');
  }
}
