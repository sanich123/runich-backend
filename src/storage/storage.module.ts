import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { MediaCleanupService } from './media-cleanup.service';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { SubscriptionModule } from 'src/subscription/subscription.module';

@Module({
  imports: [PrismaModule, SubscriptionModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [StorageController],
  providers: [StorageService, MediaCleanupService],
  exports: [StorageService, MediaCleanupService],
})
export class StorageModule {}
