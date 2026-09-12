import { NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { StorageService } from 'src/storage/storage.service';
import { asyncMock } from 'src/tests/helpers';
import { LOAD_TEST_DEFAULT_CONFIG } from '../load-test.types';
import { LoadTestSeedService } from '../load-test.service';

describe('LoadTestSeedService', () => {
  const prismaMock = {
    user: { findUnique: asyncMock(), findMany: asyncMock(), deleteMany: asyncMock() },
    loadTestSeedJob: {
      findUnique: asyncMock(),
      create: jest.fn<(args: unknown) => Promise<unknown>>(),
      update: asyncMock(),
      delete: asyncMock(),
    },
    friend: { deleteMany: asyncMock() },
  };
  const prisma = prismaMock as unknown as PrismaService;
  const storage = {} as StorageService;
  let service: LoadTestSeedService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LoadTestSeedService(prisma, storage);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'target-id' });
    prismaMock.loadTestSeedJob.findUnique.mockResolvedValue(null);
    prismaMock.loadTestSeedJob.create.mockImplementation(async (args: unknown) => ({
      id: 'job-id',
      ...(args as { data: Record<string, unknown> }).data,
    }));
  });

  it('enqueues the controlled 100 by 100 profile without starting work in the API process', async () => {
    await expect(
      service.enqueue({ runId: 'stage-feed-v1', manifestKey: 'load-test/stage-feed-v1/manifest.json' }),
    ).resolves.toMatchObject({
      status: 'queued',
      totalUsers: 100,
      totalActivities: 10_000,
      config: LOAD_TEST_DEFAULT_CONFIG,
    });
    expect(prismaMock.loadTestSeedJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'queued',
        totalUsers: 100,
        totalActivities: 10_000,
        config: LOAD_TEST_DEFAULT_CONFIG,
      }),
    });
  });

  it('returns an existing job instead of creating a duplicate run', async () => {
    const existing = { id: 'job-id', runId: 'stage-feed-v1', status: 'completed' };
    prismaMock.loadTestSeedJob.findUnique.mockResolvedValue(existing);

    await expect(service.enqueue({ runId: 'stage-feed-v1' })).resolves.toBe(existing);
    expect(prismaMock.loadTestSeedJob.create).not.toHaveBeenCalled();
  });

  it('requires the target account to exist on stage', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(service.enqueue()).rejects.toBeInstanceOf(NotFoundException);
  });
});
