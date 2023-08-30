import { MiddlewareConsumer, Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import LoggingService from 'src/logger/logger.middleware';
import { ProfileModule } from 'src/profile/profile.module';
import { ActivityModule } from 'src/activity/activity.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({ imports: [UserModule, ProfileModule, ActivityModule, AuthModule] })
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingService).forRoutes('*');
  }
}
