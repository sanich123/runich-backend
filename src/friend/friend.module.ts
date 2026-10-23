import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { FriendController } from './friend.controller';
import { FriendService } from './friend.service';
import { AccountModule } from '../account/account.module';
import { ModerationModule } from 'src/moderation/moderation.module';

@Module({
  imports: [PrismaModule, AccountModule, ModerationModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [FriendController],
  providers: [FriendService],
  exports: [FriendService],
})
export class FriendModule {}
