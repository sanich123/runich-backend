import { Module } from '@nestjs/common';
import { PrismaModule } from 'nestjs-prisma';
import { AccountService } from './account.service';
import { AccountController } from './account.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
