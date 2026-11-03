import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { MediaCleanupService } from './services/media-cleanup.service';
import { StorageController } from './storage.controller';
import { StorageService } from './services/storage.service';
import { StorageCoreService } from './services/storage-core.service';
import { StorageModerationService } from './services/storage-moderation.service';
import { StorageUploadService } from './services/storage-upload.service';
import { StorageActivityService } from './services/storage-activity.service';
import { StorageProfileService } from './services/storage-profile.service';
import { ThrottlerReflector } from 'src/common/security/throttler-reflector';

@Module({
  imports: [PrismaModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [StorageController],
  providers: [
    StorageService,
    StorageCoreService,
    StorageModerationService,
    StorageUploadService,
    StorageActivityService,
    StorageProfileService,
    MediaCleanupService,
    ThrottlerGuard,
    ThrottlerReflector,
  ],
  exports: [StorageService, MediaCleanupService],
})
export class StorageModule {}
