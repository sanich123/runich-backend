import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { StorageService } from 'src/storage/services/storage.service';
import { BackgroundWorkerModule } from '../background-worker.module';

describe('BackgroundWorkerModule', () => {
  it('can bootstrap the background workers', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [BackgroundWorkerModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(StorageService)
      .useValue({})
      .compile();

    expect(module.get(BackgroundWorkerModule)).toBeDefined();
    await module.close();
  });
});
