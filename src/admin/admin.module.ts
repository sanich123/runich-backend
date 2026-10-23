import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { AdminAccessService } from './admin-access.service';
import { AdminController } from './admin.controller';
import { AdminRolesGuard } from './admin-roles.guard';

@Module({
  imports: [PrismaModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [AdminController],
  providers: [AdminAccessService, AdminRolesGuard],
  exports: [AdminAccessService],
})
export class AdminModule {}
