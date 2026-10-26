import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { MediaCleanupService } from './services/media-cleanup.service';
import { StorageController } from './storage.controller';
import { StorageService } from './services/storage.service';

@Module({
  imports: [PrismaModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [StorageController],
  providers: [StorageService, MediaCleanupService],
  exports: [StorageService, MediaCleanupService],
})
export class StorageModule {}
