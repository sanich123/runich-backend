import { Module } from '@nestjs/common';
import { PrismaModule } from 'nestjs-prisma';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { FriendModule } from 'src/friend/friend.module';

@Module({
  imports: [PrismaModule, FriendModule],
  controllers: [ActivityController],
  providers: [ActivityService],
})
export class ActivityModule {}
