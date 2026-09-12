import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { StorageModule } from 'src/storage/storage.module';
import { LoadTestController } from './load-test.controller';
import { LoadTestSeedService } from './load-test.service';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [LoadTestController],
  providers: [LoadTestSeedService],
  exports: [LoadTestSeedService],
})
export class LoadTestModule {}
