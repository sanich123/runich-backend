import { Module } from '@nestjs/common';
import { PrismaModule } from 'nestjs-prisma';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';
import { AccountModule } from 'src/account/account.module';

@Module({
  imports: [PrismaModule, AccountModule],
  controllers: [CommentController],
  providers: [CommentService],
})
export class CommentModule {}
