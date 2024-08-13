import { Module } from '@nestjs/common';
import { PrismaModule } from 'nestjs-prisma';
import { UserService } from './user.service';
import { UserController } from './user.controller';

@Module({
  imports: [PrismaModule],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
