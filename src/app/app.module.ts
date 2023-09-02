import { MiddlewareConsumer, Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import LoggingService from 'src/logger/logger.middleware';
import { ProfileModule } from 'src/profile/profile.module';
import { ActivityModule } from 'src/activity/activity.module';
import { AuthModule } from 'src/auth/auth.module';
import { CommentModule } from 'src/comment/comment.module';
import { FriendModule } from 'src/friend/friend.module';
import { LikeModule } from 'src/like/like.module';

@Module({ imports: [UserModule, ProfileModule, ActivityModule, AuthModule, CommentModule, FriendModule, LikeModule] })
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingService).forRoutes('*');
  }
}
