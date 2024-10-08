import { Module } from '@nestjs/common';
import { PrismaModule } from 'nestjs-prisma';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { AccountModule } from 'src/account/account.module';
import { ActivityModule } from 'src/activity/activity.module';

@Module({
  imports: [PrismaModule, AccountModule, ActivityModule],
  controllers: [EmailController],
  providers: [EmailService],
})
export class EmailModule {}
