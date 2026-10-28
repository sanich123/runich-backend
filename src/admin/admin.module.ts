import { Module } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { AdminAccessService } from './admin-access.service';
import { AdminController } from './admin.controller';
import { AdminRolesGuard } from './admin-roles.guard';
import { ThrottlerReflector } from 'src/common/security/throttler-reflector';

@Module({
  imports: [PrismaModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [AdminController],
  providers: [AdminAccessService, AdminRolesGuard, ThrottlerGuard, ThrottlerReflector],
  exports: [AdminAccessService],
})
export class AdminModule {}
