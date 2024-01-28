import { Module } from '@nestjs/common';
import { PrismaModule } from 'nestjs-prisma';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { AccountModule } from 'src/account/account.module';

@Module({
  imports: [PrismaModule, AccountModule],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
