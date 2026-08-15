import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { AccountModule } from 'src/account/account.module';
import { ActivityModule } from 'src/activity/activity.module';
import { CommentModule } from 'src/comment/comment.module';
import { EmailNotificationService } from './email-notification.service';

@Module({
  imports: [PrismaModule, AccountModule, ActivityModule, CommentModule],
  controllers: [EmailController],
  providers: [EmailService, EmailNotificationService],
})
export class EmailModule {}
