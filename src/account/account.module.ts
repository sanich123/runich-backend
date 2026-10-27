import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { AccountService } from './account.service';
import { AccountController } from './account.controller';
import { ModerationModule } from 'src/moderation/moderation.module';
import { StorageModule } from 'src/storage/storage.module';

@Module({
  imports: [PrismaModule, ModerationModule, StorageModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [AccountController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
