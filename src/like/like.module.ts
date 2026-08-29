import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { LikeController } from './like.controller';
import { LikeService } from './like.service';
import { AccountModule } from 'src/account/account.module';
import { ActivityModule } from 'src/activity/activity.module';

@Module({
  imports: [PrismaModule, AccountModule, ActivityModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [LikeController],
  providers: [LikeService],
})
export class LikeModule {}
