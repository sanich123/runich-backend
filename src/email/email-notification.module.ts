import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { EmailNotificationService } from './email-notification.service';
import { EmailNotificationWorkerService } from './email-notification-worker.service';

@Module({
  imports: [PrismaModule],
  providers: [EmailNotificationService, EmailNotificationWorkerService],
  exports: [EmailNotificationService, EmailNotificationWorkerService],
})
export class EmailNotificationModule {}
