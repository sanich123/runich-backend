import { Module } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { AdminAccessService } from './admin-access.service';
import { AdminController } from './admin.controller';
import { AdminRolesGuard } from './admin-roles.guard';
import { ThrottlerReflector } from 'src/common/security/throttler-reflector';
import { AdminFeedbackService } from './admin-feedback.service';
import { FeedbackManagerGuard } from './feedback-manager.guard';
import { EmailModule } from 'src/email/email.module';
import { AdminFeedbackController } from './admin-feedback.controller';

@Module({
  imports: [PrismaModule, EmailModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [AdminController, AdminFeedbackController],
  providers: [
    AdminAccessService,
    AdminRolesGuard,
    AdminFeedbackService,
    FeedbackManagerGuard,
    ThrottlerGuard,
    ThrottlerReflector,
  ],
  exports: [AdminAccessService],
})
export class AdminModule {}
