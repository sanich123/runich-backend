import { Module } from '@nestjs/common';
import { ActivityMigrationService } from 'src/activity/activity-migration.service';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { StorageModule } from 'src/storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule],
  providers: [ActivityMigrationService],
})
export class ActivityMigrationWorkerModule {}
