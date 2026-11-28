import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { StorageService } from 'src/storage/services/storage.service';
import { GroupsModule } from 'src/groups/groups.module';
import { StatisticModule } from 'src/statistic/statistic.module';
import { BackgroundWorkerModule } from '../background-worker.module';

describe('BackgroundWorkerModule', () => {
  it('compiles feature modules with their required DI dependencies', async () => {
    process.env.JWT_SECRET ??= 'test-jwt-secret';
    const { AuthModule } = await import('src/auth/auth.module');
    const module: TestingModule = await Test.createTestingModule({
      imports: [BackgroundWorkerModule, AuthModule, GroupsModule, StatisticModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(StorageService)
      .useValue({})
      .compile();

    expect(module.get(BackgroundWorkerModule)).toBeDefined();
    expect(module.get(AuthModule)).toBeDefined();
    expect(module.get(GroupsModule)).toBeDefined();
    expect(module.get(StatisticModule)).toBeDefined();
    await module.close();
  });
});
