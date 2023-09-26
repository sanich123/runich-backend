import { Module } from '@nestjs/common';
import { PrismaModule } from 'nestjs-prisma';
import { FriendController } from './friend.controller';
import { FriendService } from './friend.service';
import { AccountModule } from 'src/account/account.module';

@Module({
  imports: [PrismaModule, AccountModule],
  controllers: [FriendController],
  providers: [FriendService],
  exports: [FriendService],
})
export class FriendModule {}
