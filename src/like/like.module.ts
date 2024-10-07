import { Module } from '@nestjs/common';
import { PrismaModule } from 'nestjs-prisma';
import { LikeController } from './like.controller';
import { LikeService } from './like.service';
import { AccountModule } from 'src/account/account.module';
import { ActivityModule } from 'src/activity/activity.module';

@Module({
  imports: [PrismaModule, AccountModule, ActivityModule],
  controllers: [LikeController],
  providers: [LikeService],
})
export class LikeModule {}
