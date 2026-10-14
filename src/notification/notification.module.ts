import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { PushNotificationService } from './push-notification.service';
import { PushNotificationWorkerService } from './push-notification-worker.service';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationController],
  providers: [NotificationService, PushNotificationService, PushNotificationWorkerService],
  exports: [NotificationService, PushNotificationWorkerService],
})
export class NotificationModule {}
