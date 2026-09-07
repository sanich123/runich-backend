import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ActivityMigrationService } from 'src/activity/activity-migration.service';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { StorageModule } from 'src/storage/storage.module';

@Module({
  imports: [ThrottlerModule.forRoot([{ name: 'default', limit: 5, ttl: 60_000 }]), PrismaModule, StorageModule],
  providers: [ActivityMigrationService],
})
export class ActivityMigrationWorkerModule {}
