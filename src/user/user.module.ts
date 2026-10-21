import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { StorageModule } from 'src/storage/storage.module';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { ModerationModule } from 'src/moderation/moderation.module';

@Module({
  imports: [PrismaModule, StorageModule, ModerationModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
