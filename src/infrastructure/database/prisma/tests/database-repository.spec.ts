import { jest } from '@jest/globals';
import { ModelRepository } from '../database-repository';

describe('ModelRepository', () => {
  it('counts filtered relations and restores their names under _count', async () => {
    const countQueries: Record<string, Promise<number>> = {};
    const commentFilterValues: unknown[] = [];
    const activityCollection = {
      include: jest.fn((relation: string, configure: (branch: never) => Promise<number>) => {
        const relationCollection = {
          where: jest.fn((buildPredicate: (fields: never) => unknown) => {
            const fields = {
              moderationStatus: {
                eq: jest.fn((value: unknown) => {
                  commentFilterValues.push(value);
                  return { field: 'moderationStatus', value };
                }),
              },
            };
            buildPredicate(fields as never);
            return relationCollection;
          }),
          count: jest.fn(async () => (relation === 'comments' ? 4 : 7)),
        };
        countQueries[relation] = configure(relationCollection as never);
        return activityCollection;
      }),
      all: async () => [
        {
          id: 'activity-1',
          comments: await countQueries.comments,
          likes: await countQueries.likes,
        },
      ],
    };
    const client = { orm: { public: { Activity: activityCollection } } };
    const repository = new ModelRepository(client as never, 'Activity');

    await expect(
      repository.findMany({
        select: {
          _count: {
            select: {
              comments: { where: { moderationStatus: 'visible' } },
              likes: true,
            },
          },
        },
      }),
    ).resolves.toEqual([{ id: 'activity-1', _count: { comments: 4, likes: 7 } }]);
    expect(commentFilterValues).toEqual(['visible']);
  });

  it('writes createMany rows in one parameterized insert', async () => {
    const execute = jest
      .fn<(plan: unknown) => Promise<{ affectedRows: number }>>()
      .mockResolvedValue({ affectedRows: 2 });
    const client = {
      orm: { public: { Activity: {} } },
      runtime: () => ({ execute }),
    };
    const metrics = { observeDatabase: jest.fn() };
    const repository = new ModelRepository(client as never, 'Activity', metrics as never);

    await expect(
      repository.createMany({
        data: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            userId: '00000000-0000-4000-8000-000000000002',
            profileId: '00000000-0000-4000-8000-000000000003',
            distance: 1,
            duration: 60,
            speed: 1,
            sport: 'run',
            source: 'strava',
            sourceActivityId: 'source-1',
            kilometresSplit: [{ kilometer: 1, pace: 280 }],
          },
          {
            id: '00000000-0000-4000-8000-000000000004',
            userId: '00000000-0000-4000-8000-000000000002',
            profileId: '00000000-0000-4000-8000-000000000003',
            distance: 2,
            duration: 120,
            speed: 1,
            sport: 'run',
            source: 'strava',
            sourceActivityId: 'source-2',
            kilometresSplit: [{ kilometer: 2, pace: 285 }],
          },
        ],
        skipDuplicates: true,
      }),
    ).resolves.toEqual({ count: 2 });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(execute.mock.calls[0]?.[0])).toContain('ON CONFLICT DO NOTHING');
    expect(JSON.stringify(execute.mock.calls[0]?.[0])).toContain('::jsonb');
    expect(metrics.observeDatabase).toHaveBeenCalledWith('Activity.createMany', expect.any(Number));
  });

  it('does not execute a query for an empty createMany input', async () => {
    const execute = jest.fn();
    const client = {
      orm: { public: { Activity: {} } },
      runtime: () => ({ execute }),
    };
    const repository = new ModelRepository(client as never, 'Activity');

    await expect(repository.createMany({ data: [] })).resolves.toEqual({ count: 0 });
    expect(execute).not.toHaveBeenCalled();
  });

  it('supports nullable values in createMany rows', async () => {
    const execute = jest
      .fn<(plan: unknown) => Promise<{ affectedRows: number }>>()
      .mockResolvedValue({ affectedRows: 1 });
    const client = {
      orm: { public: { ActivityMedia: {} } },
      runtime: () => ({ execute }),
    };
    const repository = new ModelRepository(client as never, 'ActivityMedia');

    await expect(
      repository.createMany({
        data: [
          {
            activityId: '00000000-0000-4000-8000-000000000001',
            userId: '00000000-0000-4000-8000-000000000002',
            activityDate: '2026-09-23T07:00:00.000Z',
            position: 0,
            url: 'user/activity/photo.jpg',
            thumbnail: null,
            blurhash: null,
          },
        ],
      }),
    ).resolves.toEqual({ count: 1 });

    expect(execute).toHaveBeenCalledTimes(1);
  });
});
