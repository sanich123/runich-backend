import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import { OptionalJwtAuthGuard } from 'src/auth/guards/optional-jwt-auth.guard';
import { ThrottlerReflector } from 'src/common/security/throttler-reflector';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { StorageModule } from 'src/storage/storage.module';
import { EmailModule } from 'src/email/email.module';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

@Module({
  imports: [PrismaModule, StorageModule, EmailModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [FeedbackController],
  providers: [FeedbackService, OptionalJwtAuthGuard, ThrottlerGuard, ThrottlerReflector],
  exports: [FeedbackService],
})
export class FeedbackModule {}
