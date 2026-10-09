import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { ThrottlerGuard } from '@nestjs/throttler';
import { StorageModule } from 'src/storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [EmailController],
  providers: [EmailService, ThrottlerGuard],
})
export class EmailModule {}
