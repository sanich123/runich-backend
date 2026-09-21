import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { AccountModule } from 'src/account/account.module';
import { ActivityModule } from 'src/activity/activity.module';
import { CommentModule } from 'src/comment/comment.module';
import { EmailNotificationService } from './email-notification.service';
import { ThrottlerGuard } from '@nestjs/throttler';
import { StorageModule } from 'src/storage/storage.module';

@Module({
  imports: [
    PrismaModule,
    AccountModule,
    ActivityModule,
    CommentModule,
    StorageModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [EmailController],
  providers: [EmailService, EmailNotificationService, ThrottlerGuard],
})
export class EmailModule {}
