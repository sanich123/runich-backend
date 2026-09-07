import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { StorageService } from 'src/storage/storage.service';
import { ActivityMigrationWorkerModule } from './activity-migration-worker.module';

describe('ActivityMigrationWorkerModule', () => {
  it('can bootstrap the migration and media cleanup workers', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ActivityMigrationWorkerModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(StorageService)
      .useValue({})
      .compile();

    expect(module.get(ActivityMigrationWorkerModule)).toBeDefined();
    await module.close();
  });
});
