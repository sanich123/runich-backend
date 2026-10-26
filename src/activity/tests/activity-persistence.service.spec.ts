import { jest } from '@jest/globals';
import { ActivityPersistenceService } from '../services/activity-persistence.service';

function resolvedMock<T>(value: T) {
  return jest.fn<() => Promise<T>>().mockResolvedValue(value);
}

describe('ActivityPersistenceService', () => {
  it('creates activities with or without media in the expected transaction', async () => {
    const created = { id: 'created-activity' };
    const activityCreate = resolvedMock(created);
    const activityMediaCreateMany = resolvedMock({ count: 1 });
    const activityCreateMany = resolvedMock({ count: 1 });
    const activityUpsert = resolvedMock({ id: 'stored-activity' });
    const activityUpdateMany = resolvedMock({ count: 0 });
    const transactionActivityCreate = resolvedMock(created);
    const transactionActivityMediaCreateMany = resolvedMock({ count: 1 });
    const transactionClient = {
      activity: { create: transactionActivityCreate },
      activityMedia: { createMany: transactionActivityMediaCreateMany },
    };
    const transaction = jest.fn(async (operation: (client: unknown) => Promise<unknown>) =>
      operation(transactionClient),
    );
    const prisma = {
      activity: {
        create: activityCreate,
        createMany: activityCreateMany,
        upsert: activityUpsert,
      },
      activityMedia: {
        createMany: activityMediaCreateMany,
        updateMany: activityUpdateMany,
      },
      mediaCleanupJob: {},
      $transaction: transaction,
    };
    const service = new ActivityPersistenceService(prisma as never);

    await expect(service.create({ id: 'no-media' })).resolves.toBe(created);
    expect(activityCreate).toHaveBeenCalledWith({ data: { id: 'no-media' } });
    expect(transaction).not.toHaveBeenCalled();

    await expect(service.create({ id: 'with-media' }, [{ url: 'photo' }])).resolves.toBe(created);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transactionActivityCreate).toHaveBeenCalledWith({ data: { id: 'with-media' } });
    expect(transactionActivityMediaCreateMany).toHaveBeenCalledWith({
      data: [{ url: 'photo' }],
      skipDuplicates: true,
    });

    await service.createMany([{ id: 'default-database' }]);
    expect(activityCreateMany).toHaveBeenCalledWith({
      data: [{ id: 'default-database' }],
      skipDuplicates: true,
    });
    expect(activityMediaCreateMany).not.toHaveBeenCalled();

    const customActivityCreateMany = resolvedMock({ count: 1 });
    const customMediaCreateMany = resolvedMock({ count: 1 });
    const customDatabase = {
      activity: { createMany: customActivityCreateMany },
      activityMedia: { createMany: customMediaCreateMany },
      mediaCleanupJob: {},
    };
    await service.createMany([{ id: 'custom-database' }], customDatabase as never, [{ activityId: 'custom-database' }]);
    expect(customActivityCreateMany).toHaveBeenCalledWith({
      data: [{ id: 'custom-database' }],
      skipDuplicates: true,
    });
    expect(customMediaCreateMany).toHaveBeenCalledWith({
      data: [{ activityId: 'custom-database' }],
      skipDuplicates: true,
    });
  });

  it('remaps imported media IDs and updates only dated activity media rows', async () => {
    const activityUpsert = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce({ id: 'stored-a' })
      .mockResolvedValueOnce({ id: 'stored-b' });
    const activityMediaCreateMany = resolvedMock({ count: 2 });
    const activityMediaUpdateMany = resolvedMock({ count: 1 });
    const prisma = {
      activity: {
        create: jest.fn<() => void>(),
        createMany: jest.fn<() => void>(),
        upsert: resolvedMock({ id: 'stored-default' }),
      },
      activityMedia: {
        createMany: jest.fn<() => void>(),
        updateMany: jest.fn<() => void>(),
      },
      mediaCleanupJob: {},
      $transaction: jest.fn<() => void>(),
    };
    const service = new ActivityPersistenceService(prisma as never);

    await service.upsertMany([{ id: 'no-date', userId: 'user-a', source: 'watch', sourceActivityId: 'source-0' }]);
    expect(prisma.activity.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.activityMedia.updateMany).not.toHaveBeenCalled();

    const customDatabase = {
      activity: { upsert: activityUpsert },
      activityMedia: {
        createMany: activityMediaCreateMany,
        updateMany: activityMediaUpdateMany,
      },
      mediaCleanupJob: {},
    };
    const activityDate = new Date('2026-10-21T10:00:00.000Z');
    const result = await service.upsertMany(
      [
        { id: 'temporary-a', userId: 'user-a', source: 'watch', sourceActivityId: 'source-a', date: activityDate },
        { id: 'temporary-b', userId: 'user-a', source: 'watch', sourceActivityId: 'source-b' },
      ],
      customDatabase as never,
      [{ activityId: 'temporary-a' }, { activityId: 'unmapped-media' }],
    );

    expect(result).toEqual({ count: 2 });
    expect(activityMediaCreateMany).toHaveBeenCalledWith({
      data: [{ activityId: 'stored-a' }, { activityId: 'unmapped-media' }],
      skipDuplicates: true,
    });
    expect(activityMediaUpdateMany).toHaveBeenCalledTimes(1);
    expect(activityMediaUpdateMany).toHaveBeenCalledWith({
      where: { activityId: 'stored-a' },
      data: { activityDate },
    });
  });
});
