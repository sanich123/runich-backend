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

@Module({
  imports: [
    PrismaModule,
    AccountModule,
    ActivityModule,
    CommentModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [EmailController],
  providers: [EmailService, EmailNotificationService, ThrottlerGuard],
})
export class EmailModule {}
