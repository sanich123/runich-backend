import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { ModerationAccessService } from './moderation-access.service';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { ModeratorGuard } from './moderator.guard';
import { StorageModule } from 'src/storage/storage.module';
import { AdminModule } from 'src/admin/admin.module';
import { ThrottlerReflector } from 'src/common/security/throttler-reflector';

@Module({
  imports: [PrismaModule, StorageModule, AdminModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [ModerationController],
  providers: [ModerationAccessService, ModerationService, ModeratorGuard, ThrottlerGuard, ThrottlerReflector],
  exports: [ModerationAccessService],
})
export class ModerationModule {}
