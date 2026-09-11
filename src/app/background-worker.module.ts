import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ActivityModule } from 'src/activity/activity.module';
import { ActivityMediaProcessingService } from 'src/activity/activity-media-processing.service';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { StorageModule } from 'src/storage/storage.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: 'default', limit: 5, ttl: 60_000 }]),
    PrismaModule,
    StorageModule,
    ActivityModule,
  ],
  providers: [ActivityMediaProcessingService],
})
export class BackgroundWorkerModule {}
