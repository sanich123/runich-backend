import { MiddlewareConsumer, Module } from '@nestjs/common';

import LoggingService from 'src/logger/logger.middleware';

import { PrismaModule } from 'src/prisma/prisma.module';
import { UserModule } from 'src/user/user.module';
import { ActivityModule } from 'src/activity/activity.module';
import { FriendModule } from 'src/friend/friend.module';
import { AccountModule } from 'src/account/account.module';
import { CommentModule } from 'src/comment/comment.module';
import { LikeModule } from 'src/like/like.module';
import { StatisticModule } from 'src/statistic/statistic.module';

@Module({
  imports: [
    UserModule,
    PrismaModule,
    ActivityModule,
    FriendModule,
    AccountModule,
    CommentModule,
    LikeModule,
    StatisticModule,
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingService).forRoutes('*');
  }
}
