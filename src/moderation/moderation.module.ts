import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { ModerationAccessService } from './moderation-access.service';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { ModeratorGuard } from './moderator.guard';
import { StorageModule } from 'src/storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [ModerationController],
  providers: [ModerationAccessService, ModerationService, ModeratorGuard],
  exports: [ModerationAccessService],
})
export class ModerationModule {}
