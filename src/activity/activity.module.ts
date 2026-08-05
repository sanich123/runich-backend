import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { FriendModule } from '../friend/friend.module';
import { AccountModule } from '../account/account.module';

@Module({
  imports: [PrismaModule, FriendModule, AccountModule],
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
