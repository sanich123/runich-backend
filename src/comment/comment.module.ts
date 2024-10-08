import { Module } from '@nestjs/common';
import { PrismaModule } from 'nestjs-prisma';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';
import { AccountModule } from 'src/account/account.module';
import { ActivityModule } from 'src/activity/activity.module';

@Module({
  imports: [PrismaModule, AccountModule, ActivityModule],
  controllers: [CommentController],
  providers: [CommentService],
})
export class CommentModule {}
