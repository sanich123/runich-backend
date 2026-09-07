import { Module } from '@nestjs/common';
import { ActivityMigrationService } from 'src/activity/activity-migration.service';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ActivityMigrationService],
})
export class ActivityMigrationWorkerModule {}
