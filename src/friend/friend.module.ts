import { Module } from '@nestjs/common';
import { PrismaModule } from 'nestjs-prisma';
import { FriendController } from './friend.controller';
import { FriendService } from './friend.service';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [PrismaModule, UserModule],
  controllers: [FriendController],
  providers: [FriendService],
  exports: [FriendService],
})
export class FriendModule {}
