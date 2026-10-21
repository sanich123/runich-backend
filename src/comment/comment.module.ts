import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';
import { AccountModule } from 'src/account/account.module';
import { ActivityModule } from 'src/activity/activity.module';
import { CommentLikeService } from './comment-like.service';
import { ModerationModule } from 'src/moderation/moderation.module';

@Module({
  imports: [
    PrismaModule,
    AccountModule,
    ActivityModule,
    ModerationModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [CommentController],
  providers: [CommentService, CommentLikeService],
  exports: [CommentService],
})
export class CommentModule {}
