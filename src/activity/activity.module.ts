import { Module } from '@nestjs/common';
import { PrismaModule } from 'nestjs-prisma';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { FriendModule } from '../friend/friend.module';
import { AccountModule } from '../account/account.module';

@Module({
  imports: [PrismaModule, FriendModule, AccountModule],
  controllers: [ActivityController],
  providers: [ActivityService],
})
export class ActivityModule {}
