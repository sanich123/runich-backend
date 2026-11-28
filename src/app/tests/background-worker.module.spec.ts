import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { StorageService } from 'src/storage/services/storage.service';
import { GroupsModule } from 'src/groups/groups.module';
import { StatisticModule } from 'src/statistic/statistic.module';
import { BackgroundWorkerModule } from '../background-worker.module';

describe('BackgroundWorkerModule', () => {
  it('compiles feature modules with their required DI dependencies', async () => {
    const requiredEnvironment = {
      JWT_SECRET: 'test-jwt-secret',
      S3_ENDPOINT: 'https://s3.example',
      S3_BUCKET: 'runich-test',
      S3_ACCESS_KEY: 'test-access-key',
      S3_SECRET_ACCESS_KEY: 'test-secret-key',
      S3_QUARANTINE_BUCKET: 'runich-test',
      S3_QUARANTINE_PREFIX: 'moderation-quarantine/test/',
    };
    const originalEnvironment = Object.fromEntries(
      Object.keys(requiredEnvironment).map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, requiredEnvironment);

    let module: TestingModule | undefined;
    try {
      const { AuthModule } = await import('src/auth/auth.module');
      module = await Test.createTestingModule({
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
    } finally {
      await module?.close();
      for (const [key, value] of Object.entries(originalEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
