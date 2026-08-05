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
import LoggingService from 'src/common/logger/logger.middleware';

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
    EmailModule,
    AuthModule,
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingService).forRoutes('*');
  }
}
